/**
 * GLSL for the image effects (cel, CMYK halftone, CRT), spliced into the dither fragment shader. It relies on
 * that shader's source, palette and adjustment uniforms, and its `nearest` and `srgbToOklab` functions. All
 * lengths are in output pixels.
 */
export const EFFECTS_GLSL = `
// Source texels per output pixel.
uniform float u_texels;
uniform float u_celBands;
uniform float u_celThreshold;
uniform float u_celThickness;
uniform float u_celSmooth;
uniform bool u_celPalette;
uniform vec3 u_celInk;
uniform float u_dotSize;
uniform float u_dotAngle;
uniform float u_misregister;
uniform float u_lineSize;
uniform float u_scanlines;
uniform float u_mask;
uniform float u_curvature;
uniform float u_vignette;
uniform float u_fringe;

// The source at pos with brightness and contrast applied, averaged over roughly footprint output pixels.
vec3 adjusted(vec2 pos, float footprint) {
  vec3 c = textureLod(u_tex, pos / u_size, max(0.0, log2(footprint * u_texels))).rgb;
  return clamp((c - 0.5) * u_contrast + 0.5 + u_brightness, 0.0, 1.0);
}

vec3 oklabToSrgb(vec3 lab) {
  float l = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s = lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  vec3 lin = clamp(vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ), 0.0, 1.0);
  return mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}

// Cel shading: lightness flattened into bands, with ink wherever the color changes sharply.
vec3 cel(vec2 pos) {
  vec3 color;
  if (u_celSmooth > 0.0) {
    // A 3x3 Gaussian over a slightly blurred mip, to keep noise from speckling the band boundaries.
    vec3 sum = vec3(0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        float weight = float((2 - abs(x)) * (2 - abs(y)));
        sum += weight * adjusted(pos + vec2(x, y) * u_celSmooth, u_celSmooth);
      }
    }
    color = sum / 16.0;
  } else {
    color = adjusted(pos, 1.0);
  }

  vec3 lab = srgbToOklab(color);
  lab.x = min(floor(lab.x * u_celBands), u_celBands - 1.0) / (u_celBands - 1.0);
  vec3 banded = oklabToSrgb(lab);
  if (u_celPalette) banded = nearest(banded);

  if (u_celThickness <= 0.0) return banded;

  // Sobel filter across all three channels, so edges between hues of equal lightness still count.
  float reach = u_celThickness * 0.5;
  float footprint = max(1.0, max(reach, u_celSmooth * 2.0));
  vec3 gx = vec3(0.0);
  vec3 gy = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      if (x == 0 && y == 0) continue;
      vec3 s = adjusted(pos + vec2(x, y) * reach, footprint);
      gx += s * float(x * (2 - abs(y)));
      gy += s * float(y * (2 - abs(x)));
    }
  }
  float strength = sqrt((dot(gx, gx) + dot(gy, gy)) / 3.0) / 4.0;
  float ink = smoothstep(u_celThreshold, u_celThreshold * 1.5, strength);
  // Palette mode keeps hard edges, so no in-between colors appear.
  if (u_celPalette) ink = step(0.5, ink);
  return mix(banded, u_celInk, ink);
}

// How much of the pixel at pos one ink plate covers: a rotated grid of dots sized by that ink's share of the color.
float plate(vec2 pos, int channel, float angle, vec2 offset) {
  float a = radians(angle + u_dotAngle);
  mat2 turn = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 grid = transpose(turn) * (pos - offset);
  vec2 base = floor(grid / u_dotSize);
  float coverage = 0.0;
  // Large dots spill into neighbouring cells, so those are checked too.
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 center = (base + vec2(x, y) + 0.5) * u_dotSize;
      vec3 c = adjusted(turn * center, u_dotSize);
      float k = 1.0 - max(c.r, max(c.g, c.b));
      vec3 cmy = k < 0.999 ? (1.0 - c - k) / (1.0 - k) : vec3(0.0);
      float amount = clamp(channel == 3 ? k : cmy[channel], 0.0, 1.0);
      // Area-true for light tones, swelling toward the cell's corners so solid ink leaves no paper showing.
      float radius = u_dotSize * mix(sqrt(amount / 3.14159265), 0.7072 * sqrt(amount), amount * amount);
      float dotCoverage = clamp(radius - distance(grid, center) + 0.5, 0.0, 1.0) * min(radius, 1.0);
      coverage = max(coverage, dotCoverage);
    }
  }
  return coverage;
}

// CMYK halftone: four dot screens at the traditional print angles, multiplied onto white paper.
vec3 cmyk(vec2 pos) {
  vec3 color = vec3(0.98, 0.97, 0.94);
  color *= mix(vec3(1.0), vec3(0.0, 0.68, 0.94), plate(pos, 0, 15.0, vec2(1.0, 0.0) * u_misregister));
  color *= mix(vec3(1.0), vec3(0.93, 0.05, 0.55), plate(pos, 1, 75.0, vec2(-0.5, 0.866) * u_misregister));
  color *= mix(vec3(1.0), vec3(1.0, 0.93, 0.0), plate(pos, 2, 0.0, vec2(-0.5, -0.866) * u_misregister));
  color *= mix(vec3(1.0), vec3(0.09, 0.08, 0.09), plate(pos, 3, 45.0, vec2(0.0)));
  return color;
}

// CRT: a curved tube with color fringing, scanlines, a phosphor stripe mask and darkened corners.
vec3 crt(vec2 pos) {
  vec2 c = pos / u_size * 2.0 - 1.0;
  c *= 1.0 + u_curvature * 0.2 * (c.yx * c.yx);
  vec2 uv = c * 0.5 + 0.5;
  vec2 screen = uv * u_size;
  // Antialiased edge of the tube.
  vec2 inside = clamp(min(screen, u_size - screen) + 0.5, 0.0, 1.0);
  if (inside.x * inside.y <= 0.0) return vec3(0.0);

  // The fringe grows from nothing at the center to its full width at the sides.
  vec2 shift = vec2(u_fringe * c.x, 0.0);
  vec3 color = vec3(
    adjusted(screen + shift, 1.0).r,
    adjusted(screen, 1.0).g,
    adjusted(screen - shift, 1.0).b
  );

  float beam = 0.5 - 0.5 * cos(6.2831853 * screen.y / u_lineSize);
  color *= 1.0 - u_scanlines * (1.0 - beam);

  float stripe = max(1.0, floor(u_lineSize / 3.0));
  int phosphor = int(mod(floor(pos.x / stripe), 3.0));
  vec3 mask = vec3(1.0 - u_mask);
  mask[phosphor] = 1.0;
  color *= mask;

  // Win back some of the light the scanlines and mask took away.
  color *= 1.0 / ((1.0 - 0.35 * u_scanlines) * (1.0 - 0.45 * u_mask));

  float edge = 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
  color *= mix(1.0, pow(clamp(edge, 0.0, 1.0), 0.35), u_vignette);

  return clamp(color, 0.0, 1.0) * inside.x * inside.y;
}
`

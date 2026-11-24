import { rgbToOklab } from '../image-tools/colorConversion'

export type Algorithm = 'bayer2' | 'bayer4' | 'bayer8' | 'noise' | 'threshold'

export const ALGORITHMS: { id: Algorithm; label: string }[] = [
  { id: 'bayer2', label: 'Bayer 2×2' },
  { id: 'bayer4', label: 'Bayer 4×4' },
  { id: 'bayer8', label: 'Bayer 8×8' },
  { id: 'noise', label: 'Noise' },
  { id: 'threshold', label: 'Threshold (no dither)' },
]

/** How a pixel is matched to a palette color. */
export type Matching = 'rgb' | 'perceptual' | 'value'

export const MATCHINGS: { id: Matching; label: string; hint: string }[] = [
  { id: 'rgb', label: 'RGB distance', hint: 'Nearest color by straight RGB distance.' },
  { id: 'perceptual', label: 'Perceptual (OKLab)', hint: 'Nearest color by how different it looks.' },
  { id: 'value', label: 'Value only', hint: 'Matches lightness alone and ignores hue, like a gradient map.' },
]

const MATCHING_INDEX: Record<Matching, number> = { rgb: 0, perceptual: 1, value: 2 }

export const MAX_PALETTE_COLORS = 16

export interface DitherParams {
  algorithm: Algorithm
  matching: Matching
  /** Size of one dithered "pixel", in output pixels. */
  scale: number
  /** -1 to 1, added to every channel before dithering. */
  brightness: number
  /** Multiplier around mid-grey. */
  contrast: number
  /** 0-1.5: how far the threshold pattern pushes colors toward neighbouring palette entries. */
  strength: number
  /** `#rrggbb` colors, 1 to MAX_PALETTE_COLORS. */
  palette: string[]
}

const ALGORITHM_INDEX: Record<Algorithm, number> = { bayer2: 0, bayer4: 1, bayer8: 2, noise: 3, threshold: 4 }

const VERTEX = `#version 300 es
void main() {
  // One oversized triangle covering the viewport; no buffers needed.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_scale;
uniform float u_lod;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_spread;
uniform int u_algo;
uniform int u_count;
uniform int u_match;
uniform vec3 u_palette[${MAX_PALETTE_COLORS}];
// The palette in the space used for matching (RGB, or OKLab with a/b zeroed for value matching).
uniform vec3 u_keys[${MAX_PALETTE_COLORS}];
out vec4 outColor;

// Bayer matrix value in [0, 4^levels), built by interleaving the bits of x and y.
int bayerIndex(ivec2 p, int levels) {
  int v = 0;
  for (int i = 0; i < 3; i++) {
    if (i >= levels) break;
    int xb = (p.x >> i) & 1;
    int yb = (p.y >> i) & 1;
    v = v * 4 + (((xb ^ yb) << 1) | yb);
  }
  return v;
}

float threshold(ivec2 cell) {
  if (u_algo == 0) return (float(bayerIndex(cell, 1)) + 0.5) / 4.0;
  if (u_algo == 1) return (float(bayerIndex(cell, 2)) + 0.5) / 16.0;
  if (u_algo == 2) return (float(bayerIndex(cell, 3)) + 0.5) / 64.0;
  if (u_algo == 3) {
    // Interleaved gradient noise.
    return fract(52.9829189 * fract(dot(vec2(cell), vec2(0.06711056, 0.00583715))));
  }
  return 0.5;
}

vec3 srgbToOklab(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lin = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  float l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
  float m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
  float s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;
  l = pow(l, 1.0 / 3.0);
  m = pow(m, 1.0 / 3.0);
  s = pow(s, 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  );
}

void main() {
  ivec2 cell = ivec2(floor(gl_FragCoord.xy / u_scale));
  vec2 uv = (vec2(cell) + 0.5) * u_scale / u_size;
  vec3 color = textureLod(u_tex, uv, u_lod).rgb;
  color = (color - 0.5) * u_contrast + 0.5 + u_brightness;
  color += (threshold(cell) - 0.5) * u_spread;

  vec3 key = color;
  if (u_match >= 1) key = srgbToOklab(color);
  if (u_match == 2) key.yz = vec2(0.0);

  vec3 best = u_palette[0];
  float bestDistance = 1e9;
  for (int i = 0; i < ${MAX_PALETTE_COLORS}; i++) {
    if (i >= u_count) break;
    vec3 d = key - u_keys[i];
    float distance = dot(d, d);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = u_palette[i];
    }
  }
  outColor = vec4(best, 1.0);
}`

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader failed to compile')
  }
  return shader
}

export interface DitherRenderer {
  /** Sets the output canvas size in pixels. */
  resize: (width: number, height: number) => void
  /** Uploads `source` and draws it dithered. `sourceScale` is output pixels per source pixel (for mip selection). */
  draw: (source: TexImageSource, sourceScale: number, params: DitherParams) => void
  dispose: () => void
}

/** Returns null when WebGL2 isn't available. */
export function createDitherRenderer(canvas: HTMLCanvasElement): DitherRenderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false })
  if (!gl) return null

  const program = gl.createProgram()
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program failed to link')
  }
  gl.useProgram(program)

  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const loc = {
    size: uniform('u_size'),
    scale: uniform('u_scale'),
    lod: uniform('u_lod'),
    brightness: uniform('u_brightness'),
    contrast: uniform('u_contrast'),
    spread: uniform('u_spread'),
    algo: uniform('u_algo'),
    count: uniform('u_count'),
    match: uniform('u_match'),
    keys: uniform('u_keys'),
    palette: uniform('u_palette'),
  }

  return {
    resize(width, height) {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    },

    draw(source, sourceScale, params) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      gl.generateMipmap(gl.TEXTURE_2D)

      const colors = params.palette.slice(0, MAX_PALETTE_COLORS)
      const flat = new Float32Array(MAX_PALETTE_COLORS * 3)
      const keys = new Float32Array(MAX_PALETTE_COLORS * 3)
      colors.forEach((hex, i) => {
        const rgb = hexToRgb(hex)
        flat.set(rgb, i * 3)
        if (params.matching === 'rgb') return keys.set(rgb, i * 3)
        const { l, a, b } = rgbToOklab(rgb[0] * 255, rgb[1] * 255, rgb[2] * 255)
        keys.set(params.matching === 'value' ? [l, 0, 0] : [l, a, b], i * 3)
      })
      // With ~N^(1/3) levels per channel, one level step is the natural amount to dither across.
      const levels = Math.max(2, Math.round(Math.cbrt(colors.length)))

      gl.uniform2f(loc.size, canvas.width, canvas.height)
      gl.uniform1f(loc.scale, params.scale)
      gl.uniform1f(loc.lod, Math.max(0, Math.log2(params.scale / sourceScale)))
      gl.uniform1f(loc.brightness, params.brightness)
      gl.uniform1f(loc.contrast, params.contrast)
      gl.uniform1f(loc.spread, params.strength / (levels - 1))
      gl.uniform1i(loc.algo, ALGORITHM_INDEX[params.algorithm])
      gl.uniform1i(loc.count, colors.length)
      gl.uniform1i(loc.match, MATCHING_INDEX[params.matching])
      gl.uniform3fv(loc.palette, flat)
      gl.uniform3fv(loc.keys, keys)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },

    dispose() {
      gl.deleteTexture(texture)
      // Not losing the context: getContext() on this canvas hands the same one back, which StrictMode's remount relies on.
      gl.deleteProgram(program)
    },
  }
}

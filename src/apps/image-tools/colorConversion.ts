export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

export interface OKLCh {
  /** Lightness, 0-1. */
  l: number
  /** Chroma — colorfulness independent of lightness, roughly 0 to 0.4 for in-gamut sRGB colors. */
  c: number
  /** Hue, degrees, 0-360. */
  h: number
}

export interface OKLab {
  /** Lightness, 0-1. */
  l: number
  /** Green-red axis, roughly -0.4 to 0.4 for in-gamut sRGB colors. */
  a: number
  /** Blue-yellow axis, roughly -0.4 to 0.4 for in-gamut sRGB colors. */
  b: number
}

/** Converts sRGB (0-255 per channel) to OKLab, a perceptually uniform space whose a/b axes are
 *  Cartesian — unlike OKLCh's polar hue, distances and averages in a/b behave the way you'd expect
 *  (no wraparound at 360°), which is what clustering/averaging colors needs.
 *  Coefficients: https://bottosson.github.io/posts/oklab/ */
export function rgbToOklab(r: number, g: number, b: number): OKLab {
  const rLin = srgbToLinear(r / 255)
  const gLin = srgbToLinear(g / 255)
  const bLin = srgbToLinear(b / 255)

  const l = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin
  const m = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin
  const s = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bLab = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  return { l: L, a, b: bLab }
}

/** Converts sRGB (0-255 per channel) to OKLCh, a perceptually uniform space where Chroma reads as
 *  "how colorful" independent of Lightness — unlike HSL saturation, which collapses to meaningless
 *  at extreme lightness (100% "saturated" at L=99% is still just white). */
export function rgbToOklch(r: number, g: number, b: number): OKLCh {
  const { l, a, b: bLab } = rgbToOklab(r, g, b)

  const c = Math.sqrt(a * a + bLab * bLab)
  let h = (Math.atan2(bLab, a) * 180) / Math.PI
  if (h < 0) h += 360

  return { l, c, h }
}

/** Inverse of rgbToOklab: Oklab -> linear sRGB -> sRGB, clamped to valid 0-255 channels (Oklab can
 *  represent colors outside the sRGB gamut, which would otherwise round-trip to out-of-range values). */
export function oklabToRgb(l: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const lCubed = l_ * l_ * l_
  const mCubed = m_ * m_ * m_
  const sCubed = s_ * s_ * s_

  const rLin = 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed
  const gLin = -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed
  const bLin = -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed

  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255)))
  return { r: clamp(rLin), g: clamp(gLin), b: clamp(bLin) }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

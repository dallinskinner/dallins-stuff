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

/** Converts sRGB (0-255 per channel) to OKLCh, a perceptually uniform space where Chroma reads as
 *  "how colorful" independent of Lightness — unlike HSL saturation, which collapses to meaningless
 *  at extreme lightness (100% "saturated" at L=99% is still just white).
 *  Coefficients: https://bottosson.github.io/posts/oklab/ */
export function rgbToOklch(r: number, g: number, b: number): OKLCh {
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

  const c = Math.sqrt(a * a + bLab * bLab)
  let h = (Math.atan2(bLab, a) * 180) / Math.PI
  if (h < 0) h += 360

  return { l: L, c, h }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

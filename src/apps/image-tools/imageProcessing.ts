import { linearToSrgb, srgbToLinear } from './colorConversion'

const REC709 = { r: 0.2126, g: 0.7152, b: 0.0722 }

/** Perceptual grayscale: un-gammas each channel to linear light, blends with Rec. 709 luminance
 *  weights, then re-gammas back to sRGB — averaging the raw sRGB channels directly (naive grayscale)
 *  skews the result because sRGB values aren't linear with perceived brightness. Mutates in place. */
export function toLuminanceGrayscale(imageData: ImageData): ImageData {
  const data = imageData.data
  for (let i = 0; i < data.length; i += 4) {
    const rLin = srgbToLinear(data[i] / 255)
    const gLin = srgbToLinear(data[i + 1] / 255)
    const bLin = srgbToLinear(data[i + 2] / 255)
    const yLin = REC709.r * rLin + REC709.g * gLin + REC709.b * bLin
    const gray = Math.round(linearToSrgb(yLin) * 255)
    data[i] = data[i + 1] = data[i + 2] = gray
  }
  return imageData
}

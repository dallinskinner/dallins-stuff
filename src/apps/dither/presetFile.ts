import type { Algorithm, DitherParams, Matching } from './ditherRenderer'
import { ALGORITHMS, DEFAULT_RAMP, MATCHINGS, MAX_PALETTE_COLORS, MODES } from './ditherRenderer'

const FORMAT = 'dallins-dither-preset'
const VERSION = 1

interface PresetFile extends DitherParams {
  format: typeof FORMAT
  version: typeof VERSION
}

export function serializePreset(params: DitherParams): string {
  const file: PresetFile = { format: FORMAT, version: VERSION, ...params }
  return JSON.stringify(file, null, 2)
}

const HEX = /^#[0-9a-f]{6}$/i

/** Throws a readable Error if `text` isn't a valid preset. */
export function parsePreset(text: string): DitherParams {
  let data: Partial<PresetFile>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a JSON file.')
  }
  if (data.format !== FORMAT) throw new Error('Not a dither preset file.')
  if (data.version !== VERSION) throw new Error(`Unsupported preset version ${data.version}.`)
  const { mode, ramp, cellSize, letterSpacing, lineHeight, invert, algorithm, matching, scale, brightness, contrast, strength, palette } = data
  const { celBands, celThreshold, celThickness, celSmooth, celPalette, dotSize, dotAngle, misregister } = data
  const { lineSize, scanlines, mask, curvature, vignette, fringe } = data
  const known = ALGORITHMS.some((a) => a.id === algorithm)
  if (!known || !Array.isArray(palette) || palette.length === 0 || !palette.every((c) => typeof c === 'string' && HEX.test(c))) {
    throw new Error('Preset is missing or has invalid fields.')
  }
  const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
  const within = (value: unknown, min: number, max: number, fallback: number) => Math.min(max, Math.max(min, num(value, fallback)))
  return {
    // The ASCII and effect fields were added after version 1 shipped, so older files lack them.
    mode: MODES.find((m) => m.id === mode)?.id ?? 'dither',
    ramp: typeof ramp === 'string' && ramp.length > 0 ? ramp : DEFAULT_RAMP,
    cellSize: Math.max(2, Math.round(num(cellSize, 8))),
    letterSpacing: Math.max(0.25, num(letterSpacing, 1)),
    lineHeight: Math.max(0.25, num(lineHeight, 1)),
    invert: invert === true,
    algorithm: algorithm as Algorithm,
    // Added after version 1 shipped, so older files lack it.
    matching: MATCHINGS.some((m) => m.id === matching) ? (matching as Matching) : 'rgb',
    scale: Math.max(1, Math.round(num(scale, 4))),
    brightness: num(brightness, 0),
    contrast: num(contrast, 1),
    strength: num(strength, 1),
    palette: palette.slice(0, MAX_PALETTE_COLORS),
    celBands: Math.round(within(celBands, 2, 8, 4)),
    celThreshold: within(celThreshold, 0.02, 0.6, 0.15),
    celThickness: within(celThickness, 0, 8, 2),
    celSmooth: within(celSmooth, 0, 8, 2),
    celPalette: celPalette === true,
    dotSize: within(dotSize, 3, 32, 8),
    dotAngle: within(dotAngle, 0, 90, 0),
    misregister: within(misregister, 0, 12, 0),
    lineSize: within(lineSize, 2, 16, 4),
    scanlines: within(scanlines, 0, 1, 0.5),
    mask: within(mask, 0, 1, 0.3),
    curvature: within(curvature, 0, 1, 0.3),
    vignette: within(vignette, 0, 1, 0.4),
    fringe: within(fringe, 0, 8, 1.5),
  }
}

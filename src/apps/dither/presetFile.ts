import type { Algorithm, DitherParams, Matching } from './ditherRenderer'
import { ALGORITHMS, MATCHINGS, MAX_PALETTE_COLORS } from './ditherRenderer'

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
  const { algorithm, matching, scale, brightness, contrast, strength, palette } = data
  const known = ALGORITHMS.some((a) => a.id === algorithm)
  if (!known || !Array.isArray(palette) || palette.length === 0 || !palette.every((c) => typeof c === 'string' && HEX.test(c))) {
    throw new Error('Preset is missing or has invalid fields.')
  }
  const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
  return {
    algorithm: algorithm as Algorithm,
    // Added after version 1 shipped, so older files lack it.
    matching: MATCHINGS.some((m) => m.id === matching) ? (matching as Matching) : 'rgb',
    scale: Math.max(1, Math.round(num(scale, 4))),
    brightness: num(brightness, 0),
    contrast: num(contrast, 1),
    strength: num(strength, 1),
    palette: palette.slice(0, MAX_PALETTE_COLORS),
  }
}

import type { HardwareMode } from './types'

export const FREESTYLE: HardwareMode = {
  id: 'freestyle',
  label: 'Freestyle',
  sizes: [
    { id: '16x16', label: '16 × 16 Icon', width: 16, height: 16, defaultZoom: 32 },
    { id: '32x32', label: '32 × 32 Icon', width: 32, height: 32, defaultZoom: 16 },
    { id: '64x64', label: '64 × 64 Icon', width: 64, height: 64, defaultZoom: 10 },
    { id: '256x240', label: '256 × 240 Screen', width: 256, height: 240, defaultZoom: 2 },
  ],
  masterPalette: [],
  regionSize: 0,
  subpaletteCount: 0,
  colorsPerSubpalette: 0,
  slot0: 'transparent',
  maxUniqueTiles: Infinity,
  flipDedupe: false,
  defaultPalette: { backdrop: '#000000', subpalettes: [] },
}

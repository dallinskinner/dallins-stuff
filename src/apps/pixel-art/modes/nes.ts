import type { HardwareMode, ModePalette } from './types'
import { NES_COLORS, NES_GRID } from './nesPalette'

const NES_DEFAULT_PALETTE: ModePalette = {
  backdrop: '#000000',
  subpalettes: [
    ['#ffffff', '#ababab', '#626262'],
    ['#c72e00', '#fa9e00', '#ffd59a'],
    ['#009942', '#7ae700', '#cef481'],
    ['#0d57ff', '#53aeff', '#b6e1ff'],
  ],
}

/** Background layer: one subpalette per 16×16 attribute block, 256 unique tiles, no flipping. */
export const NES_BACKGROUND: HardwareMode = {
  id: 'nes-background',
  label: 'NES Background',
  sizes: [{ id: '256x240', label: '256 × 240 Screen', width: 256, height: 240, defaultZoom: 3 }],
  masterPalette: NES_COLORS,
  masterGrid: NES_GRID,
  regionSize: 16,
  subpaletteCount: 4,
  colorsPerSubpalette: 3,
  slot0: 'backdrop',
  maxUniqueTiles: 256,
  flipDedupe: false,
  defaultPalette: NES_DEFAULT_PALETTE,
}

/** Sprites: one subpalette per 8×8 object, slot 0 transparent, 256 unique tiles where flips are free. */
export const NES_SPRITE: HardwareMode = {
  id: 'nes-sprite',
  label: 'NES Sprites',
  sizes: [
    { id: '8x8', label: '8 × 8 Sprite', width: 8, height: 8, defaultZoom: 32 },
    { id: '16x16', label: '16 × 16 Sprite', width: 16, height: 16, defaultZoom: 24 },
    { id: '32x32', label: '32 × 32 Sprite', width: 32, height: 32, defaultZoom: 16 },
    { id: '128x128', label: '128 × 128 Pattern Table', width: 128, height: 128, defaultZoom: 5 },
  ],
  masterPalette: NES_COLORS,
  masterGrid: NES_GRID,
  regionSize: 8,
  subpaletteCount: 4,
  colorsPerSubpalette: 3,
  slot0: 'transparent',
  maxUniqueTiles: 256,
  flipDedupe: true,
  defaultPalette: NES_DEFAULT_PALETTE,
}

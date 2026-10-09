export interface SizePreset {
  id: string
  label: string
  width: number
  height: number
  /** Cell size (px) the editing canvas starts at when this preset is selected. */
  defaultZoom: number
}

/** The palette RAM of a constrained mode: one shared slot-0 color plus N subpalettes of non-zero slots. */
export interface ModePalette {
  backdrop: string
  /** subpalettes[sp][i] is the hex color of slot i + 1. */
  subpalettes: string[][]
}

/** Describes the hardware rules a mode enforces. A mode with `subpaletteCount === 0` is unconstrained. */
export interface HardwareMode {
  id: string
  label: string
  sizes: SizePreset[]
  /** The fixed list of colors the hardware can display; empty means any 24-bit color. */
  masterPalette: string[]
  /** How to lay the master palette out for picking; null cells are gaps. Omit to list masterPalette in order. */
  masterGrid?: (string | null)[][]
  /** Pixels per side of the square area that must share one subpalette (0 when unconstrained). */
  regionSize: number
  subpaletteCount: number
  /** Colors per subpalette excluding slot 0. */
  colorsPerSubpalette: number
  /** What slot 0 shows: one shared opaque color, or nothing (sprites). */
  slot0: 'backdrop' | 'transparent'
  /** Max distinct 8×8 tile patterns the hardware can store (Infinity when unconstrained). */
  maxUniqueTiles: number
  /** Whether H/V-flipped copies of a tile count as the same tile. */
  flipDedupe: boolean
  defaultPalette: ModePalette
}

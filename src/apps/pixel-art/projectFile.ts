import type { PixelGrid, RGBA } from './pixelGrid'
import { TRANSPARENT, createGrid } from './pixelGrid'
import { MODES } from './modes'
import type { HardwareMode, ModePalette } from './modes/types'
import type { Owners } from './modes/constraints'
import { createOwners, isConstrained, slotIn } from './modes/constraints'

const FORMAT = 'dallins-pixel-art-project'
const VERSION = 1
const MAX_DIMENSION = 1024

/** On-disk shape. Pixels are run-length encoded as flat [colorIndex, runLength, ...] pairs over `colors`, row-major. */
interface ProjectFile {
  format: typeof FORMAT
  version: typeof VERSION
  mode: string
  width: number
  height: number
  palette: ModePalette
  /** Subpalette locked to each palette region, or null where empty. */
  owners: Owners
  colors: string[]
  pixels: number[]
  zoom: number
}

export interface Project {
  mode: HardwareMode
  grid: PixelGrid
  palette: ModePalette
  owners: Owners
  zoom: number
}

function toHex8({ r, g, b, a }: RGBA): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}${h(a)}`
}

function fromHex8(hex: string): RGBA {
  if (hex.endsWith('00')) return { ...TRANSPARENT }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: parseInt(hex.slice(7, 9), 16),
  }
}

export function serializeProject(project: Project): string {
  const { grid, mode } = project
  const colors: string[] = []
  const colorIndex = new Map<string, number>()
  const pixels: number[] = []
  for (const row of grid) {
    for (const cell of row) {
      const hex = cell.a === 0 ? '#00000000' : toHex8(cell)
      let index = colorIndex.get(hex)
      if (index === undefined) {
        index = colors.length
        colors.push(hex)
        colorIndex.set(hex, index)
      }
      const last = pixels.length - 2
      if (last >= 0 && pixels[last] === index) pixels[last + 1]++
      else pixels.push(index, 1)
    }
  }
  const file: ProjectFile = {
    format: FORMAT,
    version: VERSION,
    mode: mode.id,
    width: grid[0]?.length ?? 0,
    height: grid.length,
    palette: project.palette,
    owners: project.owners,
    colors,
    pixels,
    zoom: project.zoom,
  }
  return JSON.stringify(file)
}

const HEX6 = /^#[0-9a-f]{6}$/
const HEX8 = /^#[0-9a-f]{8}$/

/** Parses and validates a project file; throws an Error whose message says what's wrong. */
export function parseProject(text: string): Project {
  let raw: Partial<ProjectFile>
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('the file is not valid JSON')
  }
  if (!raw || raw.format !== FORMAT) throw new Error('this is not a pixel art project file')
  if (raw.version !== VERSION) throw new Error(`unsupported project version ${String(raw.version)}`)

  const mode = MODES.find((m) => m.id === raw.mode)
  if (!mode) throw new Error(`unknown mode "${String(raw.mode)}"`)

  const { width, height } = raw
  if (!Number.isInteger(width) || !Number.isInteger(height) || width! < 1 || height! < 1 || width! > MAX_DIMENSION || height! > MAX_DIMENSION) {
    throw new Error('invalid canvas size')
  }
  const { colors, pixels } = raw
  if (!Array.isArray(colors) || !colors.every((c) => typeof c === 'string' && HEX8.test(c))) throw new Error('invalid color table')
  if (!Array.isArray(pixels) || pixels.length % 2 !== 0) throw new Error('invalid pixel data')

  const grid = createGrid(width!, height!)
  const parsedColors = colors.map(fromHex8)
  let position = 0
  for (let i = 0; i < pixels.length; i += 2) {
    const index = pixels[i]
    const run = pixels[i + 1]
    if (!Number.isInteger(index) || index < 0 || index >= parsedColors.length || !Number.isInteger(run) || run < 1) {
      throw new Error('invalid pixel data')
    }
    if (position + run > width! * height!) throw new Error('pixel data is larger than the canvas')
    for (let k = 0; k < run; k++, position++) {
      grid[Math.floor(position / width!)][position % width!] = { ...parsedColors[index] }
    }
  }
  if (position !== width! * height!) throw new Error('pixel data does not fill the canvas')

  const zoom = typeof raw.zoom === 'number' && raw.zoom >= 1 ? Math.min(32, Math.round(raw.zoom)) : 1

  if (!isConstrained(mode)) {
    return { mode, grid, palette: mode.defaultPalette, owners: [], zoom }
  }

  const palette = raw.palette
  const masterColors = new Set(mode.masterPalette)
  if (
    !palette ||
    typeof palette.backdrop !== 'string' ||
    !Array.isArray(palette.subpalettes) ||
    palette.subpalettes.length !== mode.subpaletteCount ||
    !palette.subpalettes.every(
      (sp) => Array.isArray(sp) && sp.length === mode.colorsPerSubpalette && sp.every((h) => typeof h === 'string' && HEX6.test(h) && masterColors.has(h)),
    ) ||
    !HEX6.test(palette.backdrop) ||
    !masterColors.has(palette.backdrop)
  ) {
    throw new Error(`the palette doesn't fit ${mode.label}`)
  }

  const owners = raw.owners
  const expected = createOwners(mode, width!, height!)
  if (
    !Array.isArray(owners) ||
    owners.length !== expected.length ||
    !owners.every(
      (row, r) =>
        Array.isArray(row) &&
        row.length === expected[r].length &&
        row.every((o) => o === null || (Number.isInteger(o) && o >= 0 && o < mode.subpaletteCount)),
    )
  ) {
    throw new Error('invalid palette regions')
  }

  const size = mode.regionSize
  for (let r = 0; r < height!; r++) {
    for (let c = 0; c < width!; c++) {
      const cell = grid[r][c]
      if (cell.a === 0) continue
      const owner = owners[Math.floor(r / size)][Math.floor(c / size)]
      if (cell.a !== 255 || owner === null || slotIn(palette, owner, cell) < 1) {
        throw new Error(`the artwork uses colors outside its palette (row ${r + 1}, column ${c + 1})`)
      }
    }
  }
  return { mode, grid, palette, owners, zoom }
}

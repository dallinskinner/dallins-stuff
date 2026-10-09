import { rgbToOklab } from '../../image-tools/colorConversion'
import type { OKLab } from '../../image-tools/colorConversion'
import type { PixelGrid, RGBA } from '../pixelGrid'
import { TRANSPARENT, createGrid, hexToRgba, resizeGrid } from '../pixelGrid'
import type { HardwareMode, ModePalette } from './types'

/** Hardware tiles are always 8×8 pixels; palette regions (16×16 on the NES background) are multiples of that. */
export const TILE = 8

/** owners[blockRow][blockCol] is the subpalette a region is locked to, or null while it's still empty. */
export type Owners = (number | null)[][]

/** Per-tile pattern signatures and how many tiles share each, so the unique-tile count updates in O(1) per paint. */
export interface TileIndex {
  sigs: string[]
  counts: Map<string, number>
}

export function isConstrained(mode: HardwareMode): boolean {
  return mode.subpaletteCount > 0
}

function rgbKey(c: { r: number; g: number; b: number }): number {
  return (c.r << 16) | (c.g << 8) | c.b
}

const keyCache = new WeakMap<ModePalette, number[][]>()

function subpaletteKeys(palette: ModePalette): number[][] {
  let keys = keyCache.get(palette)
  if (!keys) {
    keys = palette.subpalettes.map((sp) => sp.map((hex) => parseInt(hex.slice(1), 16)))
    keyCache.set(palette, keys)
  }
  return keys
}

/** Slot index of a pixel within a subpalette: 0 for transparent, 1+ for a palette color, -1 if it isn't in the subpalette. */
export function slotIn(palette: ModePalette, sp: number, cell: RGBA): number {
  if (cell.a === 0) return 0
  const i = subpaletteKeys(palette)[sp].indexOf(rgbKey(cell))
  return i < 0 ? -1 : i + 1
}

export function createOwners(mode: HardwareMode, width: number, height: number): Owners {
  const size = mode.regionSize
  if (size === 0) return []
  return Array.from({ length: Math.ceil(height / size) }, () => Array.from({ length: Math.ceil(width / size) }, () => null))
}

export function cloneOwners(owners: Owners): Owners {
  return owners.map((row) => [...row])
}

function blockIsEmpty(grid: PixelGrid, size: number, blockRow: number, blockCol: number): boolean {
  for (let r = blockRow * size; r < Math.min(grid.length, (blockRow + 1) * size); r++) {
    for (let c = blockCol * size; c < Math.min(grid[0].length, (blockCol + 1) * size); c++) {
      if (grid[r][c].a !== 0) return false
    }
  }
  return true
}

function tileSignature(
  mode: HardwareMode,
  palette: ModePalette,
  grid: PixelGrid,
  owners: Owners,
  tileRow: number,
  tileCol: number,
): string {
  const owner = owners[Math.floor((tileRow * TILE) / mode.regionSize)][Math.floor((tileCol * TILE) / mode.regionSize)]
  const rows: string[] = []
  for (let y = 0; y < TILE; y++) {
    let line = ''
    for (let x = 0; x < TILE; x++) {
      const cell = grid[tileRow * TILE + y][tileCol * TILE + x]
      const slot = cell.a === 0 ? 0 : owner === null ? -1 : slotIn(palette, owner, cell)
      line += slot < 0 ? 'x' : slot.toString(16)
    }
    rows.push(line)
  }
  if (!mode.flipDedupe) return rows.join('')
  const flippedH = rows.map((line) => [...line].reverse().join(''))
  return [rows, flippedH, [...rows].reverse(), [...flippedH].reverse()].map((r) => r.join('')).reduce((a, b) => (b < a ? b : a))
}

export function buildTileIndex(mode: HardwareMode, palette: ModePalette, grid: PixelGrid, owners: Owners): TileIndex {
  const tilesHigh = Math.floor(grid.length / TILE)
  const tilesWide = Math.floor((grid[0]?.length ?? 0) / TILE)
  const sigs: string[] = []
  const counts = new Map<string, number>()
  for (let tr = 0; tr < tilesHigh; tr++) {
    for (let tc = 0; tc < tilesWide; tc++) {
      const sig = tileSignature(mode, palette, grid, owners, tr, tc)
      sigs.push(sig)
      counts.set(sig, (counts.get(sig) ?? 0) + 1)
    }
  }
  return { sigs, counts }
}

/** Why a paint was refused. */
export type PaintRejection = 'palette' | 'region' | 'tiles'

export type PaintOutcome =
  | { ok: true; grid: PixelGrid; owners: Owners; tiles: TileIndex }
  | { ok: false; reason: PaintRejection }

/** Applies one pixel of a constrained-mode paint, or says which hardware limit it would break. With `strict` off the tile budget is not enforced (it still counts).  An unchanged pixel is a no-op success. */
export function paintConstrained(
  mode: HardwareMode,
  palette: ModePalette,
  grid: PixelGrid,
  owners: Owners,
  tiles: TileIndex,
  activeSubpalette: number,
  row: number,
  col: number,
  color: RGBA,
  strict = true,
): PaintOutcome {
  const size = mode.regionSize
  const blockRow = Math.floor(row / size)
  const blockCol = Math.floor(col / size)
  const owner = owners[blockRow][blockCol]
  const erase = color.a === 0
  const painted = erase ? TRANSPARENT : color
  if (grid[row][col].a === painted.a && (erase || rgbKey(grid[row][col]) === rgbKey(painted))) {
    return { ok: true, grid, owners, tiles }
  }

  let nextOwner = owner
  if (!erase) {
    if (color.a !== 255) return { ok: false, reason: 'palette' }
    if (owner === null) {
      const candidates = [activeSubpalette, ...palette.subpalettes.keys()]
      const found = candidates.find((sp) => slotIn(palette, sp, color) > 0)
      if (found === undefined) return { ok: false, reason: 'palette' }
      nextOwner = found
    } else if (slotIn(palette, owner, color) < 0) {
      return { ok: false, reason: slotIn(palette, owner, color) < 0 && isInAnySubpalette(palette, color) ? 'region' : 'palette' }
    }
  }

  const nextRow = [...grid[row]]
  nextRow[col] = painted
  const nextGrid = [...grid]
  nextGrid[row] = nextRow

  let nextOwners = owners
  if (erase && owner !== null && blockIsEmpty(nextGrid, size, blockRow, blockCol)) nextOwner = null
  if (nextOwner !== owner) {
    nextOwners = cloneOwners(owners)
    nextOwners[blockRow][blockCol] = nextOwner
  }

  const tileRow = Math.floor(row / TILE)
  const tileCol = Math.floor(col / TILE)
  const tileIndex = tileRow * Math.floor(grid[0].length / TILE) + tileCol
  const sig = tileSignature(mode, palette, nextGrid, nextOwners, tileRow, tileCol)
  let nextTiles = tiles
  if (sig !== tiles.sigs[tileIndex]) {
    const counts = new Map(tiles.counts)
    const old = tiles.sigs[tileIndex]
    const oldCount = counts.get(old) ?? 0
    if (oldCount <= 1) counts.delete(old)
    else counts.set(old, oldCount - 1)
    counts.set(sig, (counts.get(sig) ?? 0) + 1)
    // Refuse only paints that push past the budget; art already over it (e.g. just converted) can still be repaired.
    if (strict && counts.size > mode.maxUniqueTiles && counts.size > tiles.counts.size) return { ok: false, reason: 'tiles' }
    const sigs = [...tiles.sigs]
    sigs[tileIndex] = sig
    nextTiles = { sigs, counts }
  }

  return { ok: true, grid: nextGrid, owners: nextOwners, tiles: nextTiles }
}

function isInAnySubpalette(palette: ModePalette, color: RGBA): boolean {
  return palette.subpalettes.some((_, sp) => slotIn(palette, sp, color) > 0)
}

/** Work out each region's subpalette from its pixels; null if some region mixes colors no single subpalette holds. */
export function inferOwners(mode: HardwareMode, palette: ModePalette, grid: PixelGrid): Owners | null {
  const owners = createOwners(mode, grid[0]?.length ?? 0, grid.length)
  const size = mode.regionSize
  for (let br = 0; br < owners.length; br++) {
    for (let bc = 0; bc < owners[br].length; bc++) {
      const cells: RGBA[] = []
      for (let r = br * size; r < Math.min(grid.length, (br + 1) * size); r++) {
        for (let c = bc * size; c < Math.min(grid[0].length, (bc + 1) * size); c++) {
          if (grid[r][c].a !== 0) cells.push(grid[r][c])
        }
      }
      if (cells.length === 0) continue
      const sp = palette.subpalettes.findIndex((_, i) => cells.every((cell) => slotIn(palette, i, cell) > 0))
      if (sp < 0) return null
      owners[br][bc] = sp
    }
  }
  return owners
}

/** Recolors every pixel in regions locked to `sp` that is `from`, e.g. when a palette entry is edited. */
export function recolorOwned(
  mode: HardwareMode,
  grid: PixelGrid,
  owners: Owners,
  sp: number,
  from: RGBA,
  to: RGBA,
): PixelGrid {
  const size = mode.regionSize
  const fromKey = rgbKey(from)
  return grid.map((rowCells, r) =>
    owners[Math.floor(r / size)].some((o) => o === sp)
      ? rowCells.map((cell, c) => (owners[Math.floor(r / size)][Math.floor(c / size)] === sp && cell.a !== 0 && rgbKey(cell) === fromKey ? to : cell))
      : rowCells,
  )
}

interface ConvertResult {
  grid: PixelGrid
  palette: ModePalette
  owners: Owners
}

/** Picks the preset a grid fits in best: the smallest that holds it, else the largest. */
function convertSize(mode: HardwareMode, width: number, height: number) {
  const fitting = mode.sizes.filter((s) => s.width >= width && s.height >= height)
  return (fitting.length > 0 ? fitting : [...mode.sizes].reverse())[0]
}

/**
 * Best-effort conversion of arbitrary art into a constrained mode: snaps colors to the master palette, then packs each
 * region's most-used colors into the mode's subpalettes. Detail the hardware can't hold is dropped to the nearest color.
 */
export function convertGridToMode(source: PixelGrid, mode: HardwareMode): ConvertResult & { size: { width: number; height: number; defaultZoom: number } } {
  const size = convertSize(mode, source[0]?.length ?? 0, source.length)
  const base = resizeGrid(source, size.width, size.height)
  const master = mode.masterPalette.map((hex) => ({ hex, lab: rgbToOklab(...rgbTuple(hex)) }))
  const nearestIn = (lab: OKLab, candidates: number[]): number => {
    let best = candidates[0]
    let bestDist = Infinity
    for (const i of candidates) {
      const d = (master[i].lab.l - lab.l) ** 2 + (master[i].lab.a - lab.a) ** 2 + (master[i].lab.b - lab.b) ** 2
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    return best
  }
  const all = master.map((_, i) => i)

  // Snap every opaque pixel to its nearest master color (-1 = transparent).
  const snapped = base.map((row) => row.map((c) => (c.a < 128 ? -1 : nearestIn(rgbToOklab(c.r, c.g, c.b), all))))

  const overall = new Map<number, number>()
  for (const row of snapped) for (const i of row) if (i >= 0) overall.set(i, (overall.get(i) ?? 0) + 1)
  const masterIndex = new Map(master.map((m, i) => [m.hex, i]))
  const backdropIndex =
    mode.slot0 === 'backdrop' && overall.size > 0
      ? [...overall.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : (masterIndex.get(mode.defaultPalette.backdrop) ?? 0)

  const rs = mode.regionSize
  const blocksHigh = Math.ceil(size.height / rs)
  const blocksWide = Math.ceil(size.width / rs)
  const cps = mode.colorsPerSubpalette

  // Each region's colors by use, most-used first, limited to what a subpalette can hold.
  const blockColors: { br: number; bc: number; colors: number[]; counts: Map<number, number> }[] = []
  for (let br = 0; br < blocksHigh; br++) {
    for (let bc = 0; bc < blocksWide; bc++) {
      const counts = new Map<number, number>()
      for (let r = br * rs; r < Math.min(size.height, (br + 1) * rs); r++) {
        for (let c = bc * rs; c < Math.min(size.width, (bc + 1) * rs); c++) {
          const i = snapped[r][c]
          if (i >= 0 && !(mode.slot0 === 'backdrop' && i === backdropIndex)) counts.set(i, (counts.get(i) ?? 0) + 1)
        }
      }
      const colors = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, cps).map(([i]) => i)
      blockColors.push({ br, bc, colors, counts })
    }
  }

  // Greedily pack regions into subpalettes, richest regions first.
  const subs: Set<number>[] = []
  const assignment = new Map<string, number>()
  for (const block of [...blockColors].sort((a, b) => b.colors.length - a.colors.length)) {
    if (block.colors.length === 0) continue
    let best = -1
    let bestCost = Infinity
    subs.forEach((sub, i) => {
      const added = block.colors.filter((c) => !sub.has(c)).length
      if (sub.size + added <= cps && added < bestCost) {
        best = i
        bestCost = added
      }
    })
    if (best < 0 && subs.length < mode.subpaletteCount) {
      subs.push(new Set())
      best = subs.length - 1
    }
    if (best < 0) {
      // No room: join the subpalette that already covers the most of this region's pixels, adding what still fits.
      let bestCover = -1
      subs.forEach((sub, i) => {
        const cover = block.colors.reduce((sum, c) => sum + (sub.has(c) ? (block.counts.get(c) ?? 0) : 0), 0)
        if (cover > bestCover) {
          bestCover = cover
          best = i
        }
      })
    }
    for (const c of block.colors) if (subs[best].size < cps) subs[best].add(c)
    assignment.set(`${block.br},${block.bc}`, best)
  }

  // Fill unused slots/subpalettes from the defaults, then anything else, keeping every entry distinct from the backdrop.
  const backdropHex = master[backdropIndex].hex
  const subpalettes = Array.from({ length: mode.subpaletteCount }, (_, i) => {
    const hexes = [...(subs[i] ?? [])].map((c) => master[c].hex)
    const fill = [...(mode.defaultPalette.subpalettes[i] ?? []), ...master.map((m) => m.hex)]
    for (const hex of fill) {
      if (hexes.length >= cps) break
      if (hex !== backdropHex && !hexes.includes(hex)) hexes.push(hex)
    }
    return hexes
  })
  const palette: ModePalette = { backdrop: backdropHex, subpalettes }

  const grid = createGrid(size.width, size.height)
  const owners = createOwners(mode, size.width, size.height)
  for (const { br, bc } of blockColors) {
    const sp = assignment.get(`${br},${bc}`)
    if (sp === undefined) continue
    const allowed = subpalettes[sp].map((hex) => masterIndex.get(hex)!)
    for (let r = br * rs; r < Math.min(size.height, (br + 1) * rs); r++) {
      for (let c = bc * rs; c < Math.min(size.width, (bc + 1) * rs); c++) {
        const i = snapped[r][c]
        if (i < 0 || (mode.slot0 === 'backdrop' && i === backdropIndex)) continue
        grid[r][c] = hexToRgba(master[nearestIn(master[i].lab, allowed)].hex)
        owners[br][bc] = sp
      }
    }
  }
  return { grid, palette, owners, size }
}

function rgbTuple(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgba(hex)
  return [r, g, b]
}

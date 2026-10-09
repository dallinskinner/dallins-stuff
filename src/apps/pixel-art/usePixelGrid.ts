import { useReducer, useRef } from 'react'
import type { PixelGrid, RGBA } from './pixelGrid'
import { createGrid, hexToRgba, resizeGrid } from './pixelGrid'
import type { HardwareMode, ModePalette } from './modes/types'
import { FREESTYLE } from './modes'
import type { Owners, PaintRejection, TileIndex } from './modes/constraints'
import {
  buildTileIndex,
  createOwners,
  inferOwners,
  isConstrained,
  paintConstrained,
  recolorOwned,
} from './modes/constraints'

/** Everything undo/redo restores. Grids are updated immutably (rows copied on write), so snapshots can share structure. */
interface Snapshot {
  grid: PixelGrid
  mode: HardwareMode
  palette: ModePalette
  owners: Owners
}

interface PixelGridState extends Snapshot {
  tiles: TileIndex | null
  undoStack: Snapshot[]
  redoStack: Snapshot[]
  /** The most recent paint refused by a hardware limit, for flashing the offending region. Never part of history. */
  rejection: { row: number; col: number; reason: PaintRejection; id: number } | null
}

export interface UsePixelGridResult {
  grid: PixelGrid
  mode: HardwareMode
  palette: ModePalette
  owners: Owners
  /** Distinct tile patterns in use; null in unconstrained modes. */
  uniqueTiles: number | null
  rejection: PixelGridState['rejection']
  canUndo: boolean
  canRedo: boolean
  beginStroke: () => void
  paintCell: (row: number, col: number, color: RGBA) => void
  paintCells: (cells: { row: number; col: number }[], color: RGBA) => void
  clear: () => void
  resize: (width: number, height: number) => void
  loadGrid: (grid: PixelGrid) => void
  /** Replaces mode, artwork, and palette in one undoable step. */
  loadModeState: (mode: HardwareMode, grid: PixelGrid, palette: ModePalette, owners: Owners) => void
  /** Edits a subpalette slot (1-based) and recolors the pixels using it; false if the color clashes within the palette. */
  setPaletteEntry: (sp: number, slot: number, hex: string) => boolean
  setBackdrop: (hex: string) => boolean
  undo: () => void
  redo: () => void
}

function snapshot(s: Snapshot): Snapshot {
  return { grid: s.grid, mode: s.mode, palette: s.palette, owners: s.owners }
}

function withTiles(s: Snapshot): Omit<PixelGridState, 'undoStack' | 'redoStack' | 'rejection'> {
  return { ...s, tiles: isConstrained(s.mode) ? buildTileIndex(s.mode, s.palette, s.grid, s.owners) : null }
}

let rejectionId = 0

export function usePixelGrid(width: number, height: number, activeSubpalette: number, strict = true): UsePixelGridResult {
  // The state lives in a ref so a drag that paints many cells in one event sees each paint's result immediately
  // (needed to refuse a paint based on the one before it); `bump` re-renders after every change.
  const stateRef = useRef<PixelGridState | null>(null)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  if (!stateRef.current) {
    stateRef.current = {
      ...withTiles({ grid: createGrid(width, height), mode: FREESTYLE, palette: FREESTYLE.defaultPalette, owners: [] }),
      undoStack: [],
      redoStack: [],
      rejection: null,
    }
  }
  const s = stateRef.current

  function commit(next: PixelGridState) {
    if (next === stateRef.current) return
    stateRef.current = next
    bump()
  }

  /** Records a history step then installs a new snapshot, rebuilding derived tile data. */
  function replace(next: Snapshot) {
    const cur = stateRef.current!
    commit({ ...withTiles(next), undoStack: [...cur.undoStack, snapshot(cur)], redoStack: [], rejection: null })
  }

  function beginStroke() {
    const cur = stateRef.current!
    commit({ ...cur, undoStack: [...cur.undoStack, snapshot(cur)], redoStack: [] })
  }

  function paintCell(row: number, col: number, color: RGBA) {
    const cur = stateRef.current!
    if (cur.tiles) {
      const outcome = paintConstrained(cur.mode, cur.palette, cur.grid, cur.owners, cur.tiles, activeSubpalette, row, col, color, strict)
      if (!outcome.ok) {
        commit({ ...cur, rejection: { row, col, reason: outcome.reason, id: ++rejectionId } })
        return
      }
      if (outcome.grid === cur.grid) return
      commit({ ...cur, grid: outcome.grid, owners: outcome.owners, tiles: outcome.tiles })
      return
    }
    const current = cur.grid[row][col]
    if (current.r === color.r && current.g === color.g && current.b === color.b && current.a === color.a) return
    const nextRow = [...cur.grid[row]]
    nextRow[col] = color
    const nextGrid = [...cur.grid]
    nextGrid[row] = nextRow
    commit({ ...cur, grid: nextGrid })
  }

  /** Paints many cells; callers wanting an undo step should call beginStroke first. */
  function paintCells(cells: { row: number; col: number }[], color: RGBA) {
    const cur = stateRef.current!
    if (cur.tiles) {
      for (const { row, col } of cells) paintCell(row, col, color)
      return
    }
    const nextGrid = [...cur.grid]
    const copied = new Set<number>()
    for (const { row, col } of cells) {
      if (!copied.has(row)) {
        nextGrid[row] = [...cur.grid[row]]
        copied.add(row)
      }
      nextGrid[row][col] = color
    }
    commit({ ...cur, grid: nextGrid })
  }

  /** Swaps in a new grid (same mode), re-deriving region ownership; art that breaks the mode's rules falls back to empty ownership. */
  function installGrid(grid: PixelGrid) {
    const cur = stateRef.current!
    const owners = isConstrained(cur.mode)
      ? (inferOwners(cur.mode, cur.palette, grid) ?? createOwners(cur.mode, grid[0]?.length ?? 0, grid.length))
      : []
    replace({ grid, mode: cur.mode, palette: cur.palette, owners })
  }

  function clear() {
    const cur = stateRef.current!
    const w = cur.grid[0]?.length ?? width
    replace({ grid: createGrid(w, cur.grid.length), mode: cur.mode, palette: cur.palette, owners: createOwners(cur.mode, w, cur.grid.length) })
  }

  function resize(nextWidth: number, nextHeight: number) {
    installGrid(resizeGrid(stateRef.current!.grid, nextWidth, nextHeight))
  }

  function loadModeState(mode: HardwareMode, grid: PixelGrid, palette: ModePalette, owners: Owners) {
    replace({ grid, mode, palette, owners })
  }

  function setPaletteEntry(sp: number, slot: number, hex: string): boolean {
    const cur = stateRef.current!
    const entries = cur.palette.subpalettes[sp]
    if (!entries || entries[slot - 1] === undefined) return false
    if (hex === cur.palette.backdrop && cur.mode.slot0 === 'backdrop') return false
    if (entries.some((e, i) => i !== slot - 1 && e === hex)) return false
    const old = entries[slot - 1]
    if (old === hex) return true
    const palette: ModePalette = {
      ...cur.palette,
      subpalettes: cur.palette.subpalettes.map((list, i) => (i === sp ? list.map((e, j) => (j === slot - 1 ? hex : e)) : list)),
    }
    const grid = recolorOwned(cur.mode, cur.grid, cur.owners, sp, hexToRgba(old), hexToRgba(hex))
    replace({ grid, mode: cur.mode, palette, owners: cur.owners })
    return true
  }

  function setBackdrop(hex: string): boolean {
    const cur = stateRef.current!
    if (cur.palette.subpalettes.some((list) => list.includes(hex))) return false
    replace({ grid: cur.grid, mode: cur.mode, palette: { ...cur.palette, backdrop: hex }, owners: cur.owners })
    return true
  }

  function undo() {
    const cur = stateRef.current!
    if (cur.undoStack.length === 0) return
    const previous = cur.undoStack[cur.undoStack.length - 1]
    commit({
      ...withTiles(previous),
      undoStack: cur.undoStack.slice(0, -1),
      redoStack: [...cur.redoStack, snapshot(cur)],
      rejection: null,
    })
  }

  function redo() {
    const cur = stateRef.current!
    if (cur.redoStack.length === 0) return
    const next = cur.redoStack[cur.redoStack.length - 1]
    commit({
      ...withTiles(next),
      redoStack: cur.redoStack.slice(0, -1),
      undoStack: [...cur.undoStack, snapshot(cur)],
      rejection: null,
    })
  }

  return {
    grid: s.grid,
    mode: s.mode,
    palette: s.palette,
    owners: s.owners,
    uniqueTiles: s.tiles ? s.tiles.counts.size : null,
    rejection: s.rejection,
    canUndo: s.undoStack.length > 0,
    canRedo: s.redoStack.length > 0,
    beginStroke,
    paintCell,
    paintCells,
    clear,
    resize,
    loadGrid: installGrid,
    loadModeState,
    setPaletteEntry,
    setBackdrop,
    undo,
    redo,
  }
}

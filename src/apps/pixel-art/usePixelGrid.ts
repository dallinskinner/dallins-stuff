import { useState } from 'react'
import type { PixelGrid, RGBA } from './pixelGrid'
import { cloneGrid, createGrid, resizeGrid } from './pixelGrid'

interface PixelGridState {
  grid: PixelGrid
  undoStack: PixelGrid[]
  redoStack: PixelGrid[]
}

export interface UsePixelGridResult {
  grid: PixelGrid
  canUndo: boolean
  canRedo: boolean
  beginStroke: () => void
  paintCell: (row: number, col: number, color: RGBA) => void
  clear: () => void
  resize: (width: number, height: number) => void
  loadGrid: (grid: PixelGrid) => void
  undo: () => void
  redo: () => void
}

export function usePixelGrid(width: number, height: number): UsePixelGridResult {
  const [state, setState] = useState<PixelGridState>(() => ({
    grid: createGrid(width, height),
    undoStack: [],
    redoStack: [],
  }))

  function beginStroke() {
    setState((s) => ({ grid: s.grid, undoStack: [...s.undoStack, cloneGrid(s.grid)], redoStack: [] }))
  }

  function paintCell(row: number, col: number, color: RGBA) {
    setState((s) => {
      const current = s.grid[row][col]
      if (current.r === color.r && current.g === color.g && current.b === color.b && current.a === color.a) {
        return s
      }
      const nextRow = [...s.grid[row]]
      nextRow[col] = color
      const nextGrid = [...s.grid]
      nextGrid[row] = nextRow
      return { ...s, grid: nextGrid }
    })
  }

  function clear() {
    setState((s) => ({
      grid: createGrid(s.grid[0]?.length ?? width, s.grid.length),
      undoStack: [...s.undoStack, cloneGrid(s.grid)],
      redoStack: [],
    }))
  }

  function resize(nextWidth: number, nextHeight: number) {
    setState((s) => ({
      grid: resizeGrid(s.grid, nextWidth, nextHeight),
      undoStack: [...s.undoStack, cloneGrid(s.grid)],
      redoStack: [],
    }))
  }

  function loadGrid(grid: PixelGrid) {
    setState((s) => ({
      grid,
      undoStack: [...s.undoStack, cloneGrid(s.grid)],
      redoStack: [],
    }))
  }

  function undo() {
    setState((s) => {
      if (s.undoStack.length === 0) return s
      const previous = s.undoStack[s.undoStack.length - 1]
      return { grid: previous, undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, cloneGrid(s.grid)] }
    })
  }

  function redo() {
    setState((s) => {
      if (s.redoStack.length === 0) return s
      const next = s.redoStack[s.redoStack.length - 1]
      return { grid: next, redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, cloneGrid(s.grid)] }
    })
  }

  return {
    grid: state.grid,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
    beginStroke,
    paintCell,
    clear,
    resize,
    loadGrid,
    undo,
    redo,
  }
}

import { forwardRef, useEffect, useRef, useState } from 'react'
import type { PixelGrid, RGBA } from './pixelGrid'
import {
  TRANSPARENT,
  bezierCells,
  cellsBetween,
  ellipseCells,
  floodFillCells,
  gridToImageData,
  rectangleCells,
} from './pixelGrid'
import styles from './PixelCanvas.module.css'

type Cell = { row: number; col: number }
type Tool = 'brush' | 'eraser' | 'ellipse' | 'fill' | 'rectangle' | 'line' | 'curve'
type ShapeTool = 'ellipse' | 'rectangle' | 'line'

/** A curve is drawn in three drags: the line's two anchors, then each anchor's control-point handle. */
interface CurveState {
  phase: 'line' | 'bend-start' | 'bend-end'
  p0: Cell
  p1: Cell
  p2: Cell
  p3: Cell
}

interface PixelCanvasProps {
  grid: PixelGrid
  width: number
  height: number
  cellSize: number
  tool: Tool
  color: RGBA
  showGrid: boolean
  onBeginStroke: () => void
  onPaintCell: (row: number, col: number, color: RGBA) => void
}

const SHAPE_CELLS: Record<ShapeTool, (r0: number, c0: number, r1: number, c1: number) => { row: number; col: number }[]> =
  {
    ellipse: ellipseCells,
    rectangle: rectangleCells,
    line: cellsBetween,
  }

function isShapeTool(tool: Tool): tool is ShapeTool {
  return tool === 'ellipse' || tool === 'rectangle' || tool === 'line'
}

function curveCells(state: CurveState): Cell[] {
  return bezierCells(state.p0, state.p1, state.p2, state.p3)
}

function inBounds(cell: { row: number; col: number }, width: number, height: number): boolean {
  return cell.row >= 0 && cell.row < height && cell.col >= 0 && cell.col < width
}

/** Clamps the drag end cell so the bounding box is square, anchored at `start`, for a perfect circle. */
function squareEndCell(
  start: { row: number; col: number },
  cell: { row: number; col: number },
): { row: number; col: number } {
  const dRow = cell.row - start.row
  const dCol = cell.col - start.col
  const d = Math.max(Math.abs(dRow), Math.abs(dCol))
  const signRow = dRow < 0 ? -1 : 1
  const signCol = dCol < 0 ? -1 : 1
  return { row: start.row + signRow * d, col: start.col + signCol * d }
}

/** Snaps the drag end cell to the nearest 45°, anchored at `start`, for horizontal/vertical/diagonal lines. */
function angleSnapEndCell(
  start: { row: number; col: number },
  cell: { row: number; col: number },
): { row: number; col: number } {
  const dRow = cell.row - start.row
  const dCol = cell.col - start.col
  if (dRow === 0 && dCol === 0) return cell
  const angle = Math.round(Math.atan2(dRow, dCol) / (Math.PI / 4)) * (Math.PI / 4)
  const dist = Math.hypot(dRow, dCol)
  return {
    row: start.row + Math.round(Math.sin(angle) * dist),
    col: start.col + Math.round(Math.cos(angle) * dist),
  }
}

const SHIFT_END_CELL: Record<
  ShapeTool,
  (start: { row: number; col: number }, cell: { row: number; col: number }) => { row: number; col: number }
> = {
  ellipse: squareEndCell,
  rectangle: squareEndCell,
  line: angleSnapEndCell,
}

export const PixelCanvas = forwardRef<HTMLCanvasElement, PixelCanvasProps>(function PixelCanvas(
  { grid, width, height, cellSize, tool, color, showGrid, onBeginStroke, onPaintCell },
  ref,
) {
  const isPaintingRef = useRef(false)
  const lastCellRef = useRef<Cell | null>(null)
  const shapeStartRef = useRef<Cell | null>(null)
  const curveRef = useRef<CurveState | null>(null)
  const [previewCells, setPreviewCells] = useState<Cell[]>([])

  // Abandons any mid-gesture state (e.g. a curve's pending bend) when the active tool changes.
  useEffect(() => {
    isPaintingRef.current = false
    shapeStartRef.current = null
    curveRef.current = null
  }, [tool])

  const [prevTool, setPrevTool] = useState(tool)
  if (prevTool !== tool) {
    setPrevTool(tool)
    if (previewCells.length > 0) setPreviewCells([])
  }

  useEffect(() => {
    const canvas = (ref as React.RefObject<HTMLCanvasElement>).current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(gridToImageData(grid), 0, 0)
    if (previewCells.length === 0) return
    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
    for (const cell of previewCells) {
      if (!inBounds(cell, width, height)) continue
      ctx.fillRect(cell.col, cell.row, 1, 1)
    }
  }, [grid, ref, previewCells, color, width, height])

  function getCell(e: React.PointerEvent<HTMLCanvasElement>): { row: number; col: number } | null {
    const canvas = (ref as React.RefObject<HTMLCanvasElement>).current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const col = Math.floor((e.clientX - rect.left) * scaleX)
    const row = Math.floor((e.clientY - rect.top) * scaleY)
    if (row < 0 || row >= height || col < 0 || col >= width) return null
    return { row, col }
  }

  function paintAt(e: React.PointerEvent<HTMLCanvasElement>) {
    const cell = getCell(e)
    if (!cell) return
    const paintColor = tool === 'eraser' ? TRANSPARENT : color
    const last = lastCellRef.current
    const cells = last ? cellsBetween(last.row, last.col, cell.row, cell.col) : [cell]
    for (const c of cells) onPaintCell(c.row, c.col, paintColor)
    lastCellRef.current = cell
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return
    const cell = getCell(e)
    if (!cell) return
    e.currentTarget.setPointerCapture(e.pointerId)
    lastCellRef.current = null

    if (tool === 'curve') {
      isPaintingRef.current = true
      let state = curveRef.current
      if (!state) {
        onBeginStroke()
        state = { phase: 'line', p0: cell, p1: cell, p2: cell, p3: cell }
        curveRef.current = state
      } else if (state.phase === 'bend-start') {
        state.p1 = cell
      } else if (state.phase === 'bend-end') {
        state.p2 = cell
      }
      setPreviewCells(curveCells(state))
      return
    }

    onBeginStroke()
    if (isShapeTool(tool)) {
      isPaintingRef.current = true
      shapeStartRef.current = cell
      setPreviewCells([cell])
    } else if (tool === 'fill') {
      for (const c of floodFillCells(grid, cell.row, cell.col)) onPaintCell(c.row, c.col, color)
    } else {
      isPaintingRef.current = true
      paintAt(e)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isPaintingRef.current) return
    if (tool === 'curve') {
      const cell = getCell(e)
      const state = curveRef.current
      if (!cell || !state) return
      if (state.phase === 'line') {
        state.p3 = cell
        state.p1 = state.p0
        state.p2 = state.p3
      } else if (state.phase === 'bend-start') {
        state.p1 = cell
      } else {
        state.p2 = cell
      }
      setPreviewCells(curveCells(state))
      return
    }
    if (isShapeTool(tool)) {
      const cell = getCell(e)
      const start = shapeStartRef.current
      if (!cell || !start) return
      const end = e.shiftKey ? SHIFT_END_CELL[tool](start, cell) : cell
      setPreviewCells(SHAPE_CELLS[tool](start.row, start.col, end.row, end.col))
    } else {
      paintAt(e)
    }
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isPaintingRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    isPaintingRef.current = false
    lastCellRef.current = null
    if (tool === 'curve') {
      const state = curveRef.current
      if (!state) return
      if (state.phase === 'line') {
        state.phase = 'bend-start'
      } else if (state.phase === 'bend-start') {
        state.phase = 'bend-end'
      } else {
        for (const cell of previewCells) {
          if (!inBounds(cell, width, height)) continue
          onPaintCell(cell.row, cell.col, color)
        }
        curveRef.current = null
        setPreviewCells([])
      }
      return
    }
    if (isShapeTool(tool)) {
      for (const cell of previewCells) {
        if (!inBounds(cell, width, height)) continue
        onPaintCell(cell.row, cell.col, color)
      }
      shapeStartRef.current = null
      setPreviewCells([])
    }
  }

  return (
    <div
      className={styles.wrapper}
      style={
        {
          '--display-width': `${width * cellSize}px`,
          '--display-height': `${height * cellSize}px`,
          '--cell-size': `${cellSize}px`,
        } as React.CSSProperties
      }
    >
      <canvas
        ref={ref}
        width={width}
        height={height}
        className={
          tool === 'brush'
            ? `${styles.canvas} ${styles.brushCursor}`
            : tool === 'eraser'
              ? `${styles.canvas} ${styles.eraserCursor}`
              : styles.canvas
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      {showGrid && <div className={styles.gridOverlay} />}
    </div>
  )
})

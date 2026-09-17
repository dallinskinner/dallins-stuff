import { forwardRef, useEffect, useRef, useState } from 'react'
import type { PixelGrid, RGBA } from './pixelGrid'
import { TRANSPARENT, cellsBetween, ellipseCells, gridToImageData } from './pixelGrid'
import styles from './PixelCanvas.module.css'

interface PixelCanvasProps {
  grid: PixelGrid
  width: number
  height: number
  cellSize: number
  tool: 'brush' | 'eraser' | 'ellipse'
  color: RGBA
  showGrid: boolean
  onBeginStroke: () => void
  onPaintCell: (row: number, col: number, color: RGBA) => void
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

export const PixelCanvas = forwardRef<HTMLCanvasElement, PixelCanvasProps>(function PixelCanvas(
  { grid, width, height, cellSize, tool, color, showGrid, onBeginStroke, onPaintCell },
  ref,
) {
  const isPaintingRef = useRef(false)
  const lastCellRef = useRef<{ row: number; col: number } | null>(null)
  const shapeStartRef = useRef<{ row: number; col: number } | null>(null)
  const [previewCells, setPreviewCells] = useState<{ row: number; col: number }[]>([])

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
    isPaintingRef.current = true
    lastCellRef.current = null
    onBeginStroke()
    if (tool === 'ellipse') {
      shapeStartRef.current = cell
      setPreviewCells([cell])
    } else {
      paintAt(e)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isPaintingRef.current) return
    if (tool === 'ellipse') {
      const cell = getCell(e)
      const start = shapeStartRef.current
      if (!cell || !start) return
      const end = e.shiftKey ? squareEndCell(start, cell) : cell
      setPreviewCells(ellipseCells(start.row, start.col, end.row, end.col))
    } else {
      paintAt(e)
    }
  }

  function endStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isPaintingRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    isPaintingRef.current = false
    lastCellRef.current = null
    if (tool === 'ellipse') {
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
        className={tool === 'brush' ? `${styles.canvas} ${styles.brushCursor}` : styles.canvas}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      {showGrid && <div className={styles.gridOverlay} />}
    </div>
  )
})

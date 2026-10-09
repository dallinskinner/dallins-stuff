import { forwardRef, useEffect, useRef, useState } from 'react'
import type { DitherPattern, PixelGrid, RGBA } from './pixelGrid'
import {
  TRANSPARENT,
  bezierCells,
  cellsBetween,
  ellipseCells,
  floodFillCells,
  gradientCells,
  gridToImageData,
  rectangleCells,
} from './pixelGrid'
import styles from './PixelCanvas.module.css'
import crtStyles from './crt.module.css'

type Cell = { row: number; col: number }
type Rect = { rowMin: number; rowMax: number; colMin: number; colMax: number }
type Tool = 'brush' | 'eraser' | 'ellipse' | 'fill' | 'rectangle' | 'line' | 'curve' | 'select' | 'gradient'
type ShapeTool = 'ellipse' | 'rectangle' | 'line'

/** A curve is drawn in three drags: the line's two anchors, then each anchor's control-point handle. */
interface CurveState {
  phase: 'line' | 'bend-start' | 'bend-end'
  p0: Cell
  p1: Cell
  p2: Cell
  p3: Cell
}

/** A selection being dragged to a new spot: the cut pixels, floating at their current top-left. */
interface FloatingSelection {
  row: number
  col: number
  data: RGBA[][]
}

interface MoveGrab {
  startCell: Cell
  originRow: number
  originCol: number
}

export interface ReferenceImage {
  url: string
  opacity: number
  /** Offset as a fraction of the canvas size, so the image stays put against the art as the canvas zoom changes. */
  x: number
  y: number
  scale: number
  /** While true the image takes the pointer so it can be dragged, and drawing is paused. */
  adjusting: boolean
  onMove: (x: number, y: number) => void
}

export interface HardwareOverlay {
  regionSize: number
  /** Subpalette owning each region, or null while empty. */
  owners: (number | null)[][]
  showTiles: boolean
  showRegions: boolean
  rejection: { row: number; col: number; id: number } | null
}

const TINTS = ['224, 82, 82', '76, 175, 120', '74, 144, 217', '224, 192, 64', '176, 96, 208', '64, 200, 200', '224, 128, 64', '160, 160, 160']

interface PixelCanvasProps {
  grid: PixelGrid
  width: number
  height: number
  cellSize: number
  tool: Tool
  color: RGBA
  /** The gradient tool's end color. */
  secondaryColor: RGBA
  /** The gradient tool's dither pattern, and the side of its repeating tile (2, 4, 8 or 16). */
  ditherPattern: DitherPattern
  ditherSize: number
  showGrid: boolean
  /** Presentation mode: draws the art with a CRT look and hides the editing overlays. Display-only. */
  crt?: boolean
  /** Color shown through transparent pixels (the NES backdrop); omit to keep them transparent. */
  backdrop?: RGBA
  /** A tracing image drawn over the canvas (not part of the artwork or the saved PNG); omit for none. */
  reference?: ReferenceImage
  /** Hardware-mode overlays; omit in freestyle. */
  hardware?: HardwareOverlay
  onBeginStroke: () => void
  onPaintCell: (row: number, col: number, color: RGBA) => void
  onPaintCells: (cells: Cell[], color: RGBA) => void
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

function cellInRect(cell: Cell, rect: Rect): boolean {
  return cell.row >= rect.rowMin && cell.row <= rect.rowMax && cell.col >= rect.colMin && cell.col <= rect.colMax
}

function floatingRect(floating: FloatingSelection): Rect {
  return {
    rowMin: floating.row,
    rowMax: floating.row + floating.data.length - 1,
    colMin: floating.col,
    colMax: floating.col + (floating.data[0]?.length ?? 0) - 1,
  }
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
  { grid, width, height, cellSize, tool, color, secondaryColor, ditherPattern, ditherSize, showGrid, crt, backdrop, reference, hardware, onBeginStroke, onPaintCell, onPaintCells },
  ref,
) {
  const isPaintingRef = useRef(false)
  const lastCellRef = useRef<Cell | null>(null)
  const shapeStartRef = useRef<Cell | null>(null)
  const curveRef = useRef<CurveState | null>(null)
  const selectModeRef = useRef<'create' | 'move' | null>(null)
  const moveGrabRef = useRef<MoveGrab | null>(null)
  const [previewCells, setPreviewCells] = useState<Cell[]>([])
  const gradientCanvasRef = useRef<HTMLCanvasElement>(null)
  const gradientFrameRef = useRef(0)
  const [handleLine, setHandleLine] = useState<{ from: Cell; to: Cell } | null>(null)
  const [anchorCell, setAnchorCell] = useState<Cell | null>(null)
  const [selection, setSelection] = useState<Rect | null>(null)
  const [floatingPreview, setFloatingPreview] = useState<FloatingSelection | null>(null)
  const [hoveringSelection, setHoveringSelection] = useState(false)

  // Abandons any mid-gesture state (e.g. a curve's pending bend) when the active tool changes.
  useEffect(() => {
    isPaintingRef.current = false
    shapeStartRef.current = null
    curveRef.current = null
    selectModeRef.current = null
    moveGrabRef.current = null
    cancelAnimationFrame(gradientFrameRef.current)
  }, [tool])

  useEffect(() => () => cancelAnimationFrame(gradientFrameRef.current), [])

  const [prevTool, setPrevTool] = useState(tool)
  if (prevTool !== tool) {
    const previous = prevTool
    setPrevTool(tool)
    if (previewCells.length > 0) setPreviewCells([])
    if (handleLine) setHandleLine(null)
    if (anchorCell) setAnchorCell(null)
    // The gradient tool clips to the selection, so a selection survives switching between it and the select tool.
    const keepSelection = (previous === 'select' && tool === 'gradient') || (previous === 'gradient' && tool === 'select')
    if (selection && !keepSelection) setSelection(null)
    if (floatingPreview) setFloatingPreview(null)
    if (hoveringSelection) setHoveringSelection(false)
  }

  const activeSelectionRect = floatingPreview ? floatingRect(floatingPreview) : selection

  useEffect(() => {
    const canvas = (ref as React.RefObject<HTMLCanvasElement>).current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(gridToImageData(grid, backdrop), 0, 0)
    if (previewCells.length > 0) {
      // A transparent paint color (the backdrop slot) would draw nothing, so preview it by inverting what's underneath.
      const erasing = color.a === 0
      ctx.globalCompositeOperation = erasing ? 'difference' : 'source-over'
      ctx.fillStyle = erasing ? '#ffffff' : `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
      for (const cell of previewCells) {
        if (!inBounds(cell, width, height)) continue
        ctx.fillRect(cell.col, cell.row, 1, 1)
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    if (floatingPreview) {
      for (let r = 0; r < floatingPreview.data.length; r++) {
        for (let c = 0; c < floatingPreview.data[r].length; c++) {
          const pixel = floatingPreview.data[r][c]
          if (pixel.a === 0) continue
          const cell = { row: floatingPreview.row + r, col: floatingPreview.col + c }
          if (!inBounds(cell, width, height)) continue
          ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${pixel.a / 255})`
          ctx.fillRect(cell.col, cell.row, 1, 1)
        }
      }
    }
  }, [grid, ref, previewCells, color, width, height, floatingPreview, backdrop])

  // Tints each region by the subpalette it's locked to, so the player can see where one palette's reach ends.
  const tintRef = useRef<HTMLCanvasElement>(null)
  const showRegions = hardware?.showRegions
  const owners = hardware?.owners
  const regionSize = hardware?.regionSize ?? 0
  useEffect(() => {
    const ctx = tintRef.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    if (!showRegions || !owners) return
    owners.forEach((row, br) =>
      row.forEach((owner, bc) => {
        if (owner === null) return
        ctx.fillStyle = `rgba(${TINTS[owner % TINTS.length]}, 0.3)`
        ctx.fillRect(bc * regionSize, br * regionSize, regionSize, regionSize)
      }),
    )
  }, [showRegions, owners, regionSize, width, height])

  const referenceDragRef = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(null)

  function handleReferencePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (!reference || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    referenceDragRef.current = { pointerX: e.clientX, pointerY: e.clientY, x: reference.x, y: reference.y }
  }

  function handleReferencePointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const drag = referenceDragRef.current
    if (!drag || !reference) return
    reference.onMove(
      drag.x + (e.clientX - drag.pointerX) / (width * cellSize),
      drag.y + (e.clientY - drag.pointerY) / (height * cellSize),
    )
  }

  /** The dither the gradient would produce, drawn straight into an overlay canvas (not React state, and not
   *  the artwork canvas), and coalesced to one draw per animation frame so a fast drag can't queue work. */
  function previewGradient(start: Cell, end: Cell) {
    cancelAnimationFrame(gradientFrameRef.current)
    gradientFrameRef.current = requestAnimationFrame(() => {
      const ctx = gradientCanvasRef.current?.getContext('2d')
      if (!ctx) return
      const image = ctx.createImageData(width, height)
      const bounds = selection ?? { rowMin: 0, rowMax: height - 1, colMin: 0, colMax: width - 1 }
      for (const cell of gradientCells(start.row, start.col, end.row, end.col, ditherPattern, ditherSize, bounds)) {
        const paint = cell.useSecondary ? secondaryColor : color
        const i = (cell.row * width + cell.col) * 4
        image.data[i] = paint.r
        image.data[i + 1] = paint.g
        image.data[i + 2] = paint.b
        image.data[i + 3] = paint.a
      }
      ctx.putImageData(image, 0, 0)
    })
  }

  function clearGradientPreview() {
    cancelAnimationFrame(gradientFrameRef.current)
    gradientCanvasRef.current?.getContext('2d')?.clearRect(0, 0, width, height)
  }

  /** Dithers the gradient into the selection (or whole canvas) in one pass; only run on release, never per pointer move. */
  function commitGradient(start: Cell, end: Cell) {
    const bounds = selection ?? { rowMin: 0, rowMax: height - 1, colMin: 0, colMax: width - 1 }
    const primary: Cell[] = []
    const secondary: Cell[] = []
    for (const cell of gradientCells(start.row, start.col, end.row, end.col, ditherPattern, ditherSize, bounds)) {
      ;(cell.useSecondary ? secondary : primary).push(cell)
    }
    onPaintCells(primary, color)
    onPaintCells(secondary, secondaryColor)
  }

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
        setHandleLine({ from: state.p0, to: cell })
      } else if (state.phase === 'bend-end') {
        state.p2 = cell
        setHandleLine({ from: state.p3, to: cell })
      }
      setPreviewCells(curveCells(state))
      return
    }

    if (tool === 'select') {
      isPaintingRef.current = true
      if (selection && cellInRect(cell, selection)) {
        onBeginStroke()
        const rows = selection.rowMax - selection.rowMin + 1
        const cols = selection.colMax - selection.colMin + 1
        const data: RGBA[][] = []
        for (let r = 0; r < rows; r++) {
          const row: RGBA[] = []
          for (let c = 0; c < cols; c++) row.push(grid[selection.rowMin + r][selection.colMin + c])
          data.push(row)
        }
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) onPaintCell(selection.rowMin + r, selection.colMin + c, TRANSPARENT)
        }
        selectModeRef.current = 'move'
        moveGrabRef.current = { startCell: cell, originRow: selection.rowMin, originCol: selection.colMin }
        setFloatingPreview({ row: selection.rowMin, col: selection.colMin, data })
        setHoveringSelection(true)
      } else {
        selectModeRef.current = 'create'
        shapeStartRef.current = cell
        setSelection({ rowMin: cell.row, rowMax: cell.row, colMin: cell.col, colMax: cell.col })
        setHoveringSelection(false)
      }
      return
    }

    onBeginStroke()
    if (tool === 'gradient') {
      isPaintingRef.current = true
      shapeStartRef.current = cell
      setHandleLine({ from: cell, to: cell })
      setAnchorCell(cell)
    } else if (isShapeTool(tool)) {
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
    if (tool === 'select' && !isPaintingRef.current) {
      const cell = getCell(e)
      const hover = !!(cell && selection && cellInRect(cell, selection))
      if (hover !== hoveringSelection) setHoveringSelection(hover)
    }
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
        setHandleLine({ from: state.p0, to: cell })
      } else {
        state.p2 = cell
        setHandleLine({ from: state.p3, to: cell })
      }
      setPreviewCells(curveCells(state))
      return
    }
    if (tool === 'select') {
      const cell = getCell(e)
      if (!cell) return
      if (selectModeRef.current === 'create') {
        const start = shapeStartRef.current
        if (!start) return
        setSelection({
          rowMin: Math.min(start.row, cell.row),
          rowMax: Math.max(start.row, cell.row),
          colMin: Math.min(start.col, cell.col),
          colMax: Math.max(start.col, cell.col),
        })
      } else if (selectModeRef.current === 'move') {
        const grab = moveGrabRef.current
        if (!grab) return
        const row = grab.originRow + (cell.row - grab.startCell.row)
        const col = grab.originCol + (cell.col - grab.startCell.col)
        setFloatingPreview((prev) => (prev ? { ...prev, row, col } : prev))
      }
      return
    }
    if (tool === 'gradient') {
      const cell = getCell(e)
      const start = shapeStartRef.current
      if (!cell || !start) return
      // Just the drag axis while dragging; the dither is computed once on release. Skip moves within the same cell.
      const end = e.shiftKey ? angleSnapEndCell(start, cell) : cell
      if (handleLine && handleLine.to.row === end.row && handleLine.to.col === end.col) return
      setHandleLine({ from: start, to: end })
      previewGradient(start, end)
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
        setAnchorCell(state.p0)
      } else if (state.phase === 'bend-start') {
        state.phase = 'bend-end'
        setAnchorCell(state.p3)
      } else {
        for (const cell of previewCells) {
          if (!inBounds(cell, width, height)) continue
          onPaintCell(cell.row, cell.col, color)
        }
        curveRef.current = null
        setPreviewCells([])
        setAnchorCell(null)
      }
      setHandleLine(null)
      return
    }
    if (tool === 'select') {
      if (selectModeRef.current === 'create') {
        const collapsed = selection && selection.rowMin === selection.rowMax && selection.colMin === selection.colMax
        if (collapsed) {
          setSelection(null)
          setHoveringSelection(false)
        } else {
          setHoveringSelection(true)
        }
      } else if (selectModeRef.current === 'move' && floatingPreview) {
        const rect = floatingRect(floatingPreview)
        for (let r = 0; r < floatingPreview.data.length; r++) {
          for (let c = 0; c < floatingPreview.data[r].length; c++) {
            const cell = { row: floatingPreview.row + r, col: floatingPreview.col + c }
            if (!inBounds(cell, width, height)) continue
            onPaintCell(cell.row, cell.col, floatingPreview.data[r][c])
          }
        }
        setSelection(rect)
        setFloatingPreview(null)
        setHoveringSelection(true)
      }
      selectModeRef.current = null
      moveGrabRef.current = null
      return
    }
    if (tool === 'gradient') {
      const start = shapeStartRef.current
      const end = handleLine?.to
      if (start && end) commitGradient(start, end)
      shapeStartRef.current = null
      setHandleLine(null)
      setAnchorCell(null)
      clearGradientPreview()
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
        className={[
          styles.canvas,
          tool === 'brush' && styles.brushCursor,
          tool === 'eraser' && styles.eraserCursor,
          tool === 'select' && hoveringSelection && styles.moveCursor,
          crt && crtStyles.image,
        ]
          .filter(Boolean)
          .join(' ')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      {reference && (
        <img
          src={reference.url}
          alt=""
          draggable={false}
          className={reference.adjusting ? `${styles.reference} ${styles.referenceAdjusting}` : styles.reference}
          style={
            {
              '--reference-opacity': reference.opacity,
              '--reference-x': `${reference.x * 100}%`,
              '--reference-y': `${reference.y * 100}%`,
              '--reference-scale': reference.scale,
            } as React.CSSProperties
          }
          onPointerDown={handleReferencePointerDown}
          onPointerMove={handleReferencePointerMove}
          onPointerUp={() => (referenceDragRef.current = null)}
          onPointerCancel={() => (referenceDragRef.current = null)}
        />
      )}
      {tool === 'gradient' && (
        <canvas ref={gradientCanvasRef} width={width} height={height} className={styles.tintCanvas} />
      )}
      {hardware && !crt && (
        <canvas ref={tintRef} width={width} height={height} className={styles.tintCanvas} />
      )}
      {showGrid && !crt && <div className={styles.gridOverlay} />}
      {crt && <div className={crtStyles.overlay} style={{ '--crt-line': `${cellSize}px` } as React.CSSProperties} />}
      {hardware?.showTiles && !crt && <div className={styles.tileOverlay} style={{ '--tile-size': `${8 * cellSize}px` } as React.CSSProperties} />}
      {hardware?.showRegions && !crt && (
        <div className={styles.regionOverlay} style={{ '--region-size': `${hardware.regionSize * cellSize}px` } as React.CSSProperties} />
      )}
      {hardware?.rejection && !crt && (
        <div
          key={hardware.rejection.id}
          className={styles.rejectFlash}
          style={
            {
              '--sel-x': `${Math.floor(hardware.rejection.col / hardware.regionSize) * hardware.regionSize * cellSize}px`,
              '--sel-y': `${Math.floor(hardware.rejection.row / hardware.regionSize) * hardware.regionSize * cellSize}px`,
              '--sel-w': `${hardware.regionSize * cellSize}px`,
              '--sel-h': `${hardware.regionSize * cellSize}px`,
            } as React.CSSProperties
          }
        />
      )}
      {activeSelectionRect && (
        <div
          className={styles.selectionOverlay}
          style={
            {
              '--sel-x': `${activeSelectionRect.colMin * cellSize}px`,
              '--sel-y': `${activeSelectionRect.rowMin * cellSize}px`,
              '--sel-w': `${(activeSelectionRect.colMax - activeSelectionRect.colMin + 1) * cellSize}px`,
              '--sel-h': `${(activeSelectionRect.rowMax - activeSelectionRect.rowMin + 1) * cellSize}px`,
            } as React.CSSProperties
          }
        />
      )}
      {handleLine && (
        <svg className={styles.handleLineSvg} width={width * cellSize} height={height * cellSize}>
          <line
            className={styles.handleLine}
            x1={(handleLine.from.col + 0.5) * cellSize}
            y1={(handleLine.from.row + 0.5) * cellSize}
            x2={(handleLine.to.col + 0.5) * cellSize}
            y2={(handleLine.to.row + 0.5) * cellSize}
          />
        </svg>
      )}
      {anchorCell && (
        <div
          className={styles.selectionOverlay}
          style={
            {
              '--sel-x': `${anchorCell.col * cellSize}px`,
              '--sel-y': `${anchorCell.row * cellSize}px`,
              '--sel-w': `${cellSize}px`,
              '--sel-h': `${cellSize}px`,
            } as React.CSSProperties
          }
        />
      )}
    </div>
  )
})

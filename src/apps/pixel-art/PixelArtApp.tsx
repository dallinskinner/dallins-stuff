import { useRef, useState } from 'react'
import { GRID_HEIGHT, GRID_WIDTH, CELL_SIZE, hexToRgba, imageDataToGrid } from './pixelGrid'
import { usePixelGrid } from './usePixelGrid'
import { PixelCanvas } from './PixelCanvas'
import { PixelPreview } from './PixelPreview'
import pencilIcon from '../../assets/icons/pencil.png'
import circleIcon from '../../assets/icons/circle.png'
import eraserIcon from '../../assets/icons/eraser.png'
import fillIcon from '../../assets/icons/fill.png'
import squareIcon from '../../assets/icons/square.png'
import styles from './PixelArtApp.module.css'

type Tool = 'brush' | 'eraser' | 'ellipse' | 'fill' | 'rectangle'

const GRID_SIZES = [16, 32] as const
const ZOOM_MIN = 1
const ZOOM_MAX = 4
const MAX_DISPLAY = GRID_WIDTH * CELL_SIZE
const MAX_PREVIEW = Math.max(...GRID_SIZES) * ZOOM_MAX

export function PixelArtApp() {
  const { grid, canUndo, canRedo, beginStroke, paintCell, clear, resize, loadGrid, undo, redo } = usePixelGrid(
    GRID_WIDTH,
    GRID_HEIGHT,
  )
  const [colorHex, setColorHex] = useState('#000000')
  const [tool, setTool] = useState<Tool>('brush')
  const [showGrid, setShowGrid] = useState(true)
  const [zoom, setZoom] = useState<number>(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const height = grid.length
  const width = grid[0]?.length ?? 0
  const cellSize = Math.floor(MAX_DISPLAY / Math.max(width, height))

  function handleSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const size = Number(e.target.value)
    resize(size, size)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'pixel-art.png'
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  async function handleLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const bitmap = await createImageBitmap(file)
    const scratch = document.createElement('canvas')
    scratch.width = width
    scratch.height = height
    const ctx = scratch.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, 0, 0, width, height)
    loadGrid(imageDataToGrid(ctx.getImageData(0, 0, width, height)))
  }

  return (
    <div className={styles.app}>
      <div className={styles.workspace}>
        <div className={styles.toolPanel}>
          <div className={styles.toolButtons}>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'brush'}
              aria-label="Brush"
              onClick={() => setTool('brush')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${pencilIcon})` } as React.CSSProperties} />
            </button>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'eraser'}
              aria-label="Eraser"
              onClick={() => setTool('eraser')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${eraserIcon})` } as React.CSSProperties} />
            </button>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'ellipse'}
              aria-label="Ellipse"
              onClick={() => setTool('ellipse')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${circleIcon})` } as React.CSSProperties} />
            </button>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'rectangle'}
              aria-label="Rectangle"
              onClick={() => setTool('rectangle')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${squareIcon})` } as React.CSSProperties} />
            </button>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'fill'}
              aria-label="Fill"
              onClick={() => setTool('fill')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${fillIcon})` } as React.CSSProperties} />
            </button>
          </div>
          <label className={styles.activeColor} style={{ backgroundColor: colorHex }} aria-label="Active color">
            <input
              type="color"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              className={styles.hiddenColorInput}
            />
          </label>
        </div>
        <PixelCanvas
          ref={canvasRef}
          grid={grid}
          width={width}
          height={height}
          cellSize={cellSize}
          tool={tool}
          color={hexToRgba(colorHex)}
          showGrid={showGrid}
          onBeginStroke={beginStroke}
          onPaintCell={paintCell}
        />
        <div className={styles.actions}>
          <button type="button" onClick={clear}>
            Clear
          </button>
          <button type="button" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" onClick={redo} disabled={!canRedo}>
            Redo
          </button>
          <button type="button" onClick={handleSave}>
            Save as PNG
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Load PNG
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png"
            onChange={handleLoad}
            className={styles.hiddenFileInput}
          />
        </div>
        <div className={styles.previewCorner}>
          <label className={styles.zoomSlider}>
            Zoom {zoom}x
            <input
              type="range"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <PixelPreview grid={grid} width={width} height={height} zoom={zoom} maxSize={MAX_PREVIEW} />
        </div>
      </div>
      <div className={styles.bottomBar}>
        <select aria-label="Size" value={width} onChange={handleSizeChange}>
          {GRID_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} x {size}
            </option>
          ))}
        </select>
        <label>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show Grid
        </label>
      </div>
    </div>
  )
}

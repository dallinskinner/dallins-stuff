import { useCallback, useEffect, useRef, useState } from 'react'
import {
  chromaPercent,
  drawAnnotation,
  drawDragPreview,
  getAnnotationScale,
  hitTestAnnotationAnchor,
  lightnessPercent,
  type Annotation,
  type PaletteColor,
  type Point,
  type SampledColor,
  type ThemeColors,
} from './annotationRendering'
import gearIcon from '../../assets/icons/gear.png'
import { useWindowFocus } from '../../desktop/WindowManager'
import { rgbToHex, rgbToOklch } from './colorConversion'
import { toLuminanceGrayscale } from './imageProcessing'
import { extractPalette } from './paletteExtraction'
import styles from './ImageToolsApp.module.css'

// Neighborhood averaged per click, as a distance from center (2 -> 5x5).
const SAMPLE_RADIUS = 2
const MIN_PALETTE_COLORS = 3
const MAX_PALETTE_COLORS = 12
const DEFAULT_PALETTE_COLORS = 6

type Tool = 'eyedropper' | 'annotate' | 'crop'
type CropRect = { x: number; y: number; width: number; height: number }
type StatKey = 'hex' | 'lightness' | 'chroma' | 'hue'
type SortKey = 'lightness' | 'chroma'

const STAT_LABELS: Record<StatKey, string> = { hex: 'Hex', lightness: 'Lightness', chroma: 'Chroma', hue: 'Hue' }

function sampleColorAt(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, px: number, py: number): SampledColor {
  const x0 = Math.max(0, px - SAMPLE_RADIUS)
  const y0 = Math.max(0, py - SAMPLE_RADIUS)
  const x1 = Math.min(canvas.width, px + SAMPLE_RADIUS + 1)
  const y1 = Math.min(canvas.height, py + SAMPLE_RADIUS + 1)
  const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)

  let r = 0
  let g = 0
  let b = 0
  const count = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  r = Math.round(r / count)
  g = Math.round(g / count)
  b = Math.round(b / count)

  return { hex: rgbToHex(r, g, b), ...rgbToOklch(r, g, b) }
}

// The canvas's on-screen size is CSS-scaled (max-width: 100%), so map a pointer event back to
// actual pixel coordinates before reading/drawing.
function toCanvasPoint(e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.floor((e.clientX - rect.left) * (canvas.width / rect.width)),
    y: Math.floor((e.clientY - rect.top) * (canvas.height / rect.height)),
  }
}

// Dims everything outside the crop selection and outlines the selection itself, like a standard
// crop tool's marquee.
function drawCropMask(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, rect: CropRect) {
  const scale = getAnnotationScale(canvasWidth)
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height)
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5 * scale
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
  ctx.restore()
}

function getThemeColors(el: Element): ThemeColors {
  const style = getComputedStyle(el)
  return {
    background: style.getPropertyValue('--content-background').trim(),
    foreground: style.getPropertyValue('--foreground').trim(),
    border: style.getPropertyValue('--border').trim(),
    accent: style.getPropertyValue('--accent').trim(),
  }
}

export function ImageToolsApp() {
  const { isFocused: isWindowFocused } = useWindowFocus()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const originalImageData = useRef<ImageData | null>(null)
  const dragOriginRef = useRef<{ point: Point; color: SampledColor } | null>(null)
  const draggingExistingIdRef = useRef<number | null>(null)
  // Offset from the pointer to the annotation's anchor at grab time, so repositioning moves the box
  // relative to where you grabbed it instead of snapping its corner to the cursor.
  const dragOffsetRef = useRef<Point | null>(null)
  const [hasImage, setHasImage] = useState(false)
  const [fileName, setFileName] = useState('image')
  const [isGrayscale, setIsGrayscale] = useState(false)
  const [palette, setPalette] = useState<PaletteColor[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [paletteColorCount, setPaletteColorCount] = useState(DEFAULT_PALETTE_COLORS)
  const [tool, setTool] = useState<Tool>('eyedropper')
  const [dragAnchor, setDragAnchor] = useState<Point | null>(null)
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const cropDragStartRef = useRef<Point | null>(null)
  const [canvasHeight, setCanvasHeight] = useState<number | null>(null)
  const [visibleStats, setVisibleStats] = useState<Record<StatKey, boolean>>({
    hex: true,
    lightness: true,
    chroma: true,
    hue: true,
  })
  const [sortBy, setSortBy] = useState<SortKey>('lightness')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const nextPaletteId = useRef(0)

  // Closes the settings dropdown on an outside click.
  useEffect(() => {
    if (!settingsOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [settingsOpen])

  // Tracks the canvas's rendered (CSS-scaled) height so the sidebar can match it exactly and scroll
  // its own content instead of growing past the image.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(([entry]) => setCanvasHeight(entry.contentRect.height))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  const loadImageFile = useCallback(async (file: File) => {
    const bitmap = await createImageBitmap(file)
    const canvas = canvasRef.current
    const overlay = overlayCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !overlay || !ctx) return

    canvas.width = bitmap.width
    canvas.height = bitmap.height
    overlay.width = bitmap.width
    overlay.height = bitmap.height
    ctx.drawImage(bitmap, 0, 0)
    originalImageData.current = ctx.getImageData(0, 0, canvas.width, canvas.height)

    setFileName(file.name.replace(/\.[^.]+$/, '') || 'image')
    setIsGrayscale(false)
    setHasImage(true)
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await loadImageFile(file)
  }

  // Pasted images (e.g. a copied screenshot) arrive as clipboard data rather than a file input
  // change, so listen globally rather than requiring a specific element to be focused — but only
  // while this window is focused, so pastes meant for another window don't land here.
  useEffect(() => {
    if (!isWindowFocused) return

    function handlePaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (!file) return

      e.preventDefault()
      void loadImageFile(file)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [loadImageFile, isWindowFocused])

  // Redraws the overlay from scratch whenever the placed annotations, or an in-progress drag,
  // change — the overlay canvas itself holds no state, it's purely a projection of `palette`.
  useEffect(() => {
    const overlay = overlayCanvasRef.current
    const canvas = canvasRef.current
    const ctx = overlay?.getContext('2d')
    if (!overlay || !canvas || !ctx || !hasImage) return

    ctx.clearRect(0, 0, overlay.width, overlay.height)
    const theme = getThemeColors(canvas)
    const scale = getAnnotationScale(canvas.width)

    for (const swatch of palette) {
      if (swatch.annotation) drawAnnotation(ctx, swatch as PaletteColor & { annotation: Annotation }, theme, scale)
    }

    if (dragOriginRef.current && dragAnchor) {
      drawDragPreview(ctx, dragOriginRef.current.point, dragAnchor, dragOriginRef.current.color.hex, theme, scale)
    }

    if (tool === 'crop' && cropRect) {
      drawCropMask(ctx, overlay.width, overlay.height, cropRect)
    }
  }, [palette, dragAnchor, hasImage, tool, cropRect])

  // Resets any hover cursor left over from annotate mode when switching tools.
  useEffect(() => {
    if (overlayCanvasRef.current) overlayCanvasRef.current.style.cursor = ''
  }, [tool])

  function selectTool(next: Tool) {
    setTool(next)
    if (next !== 'crop') setCropRect(null)
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || isProcessing) return

    const point = toCanvasPoint(e, canvas)

    if (tool === 'eyedropper') {
      const color = sampleColorAt(canvas, ctx, point.x, point.y)
      setPalette((prev) => [...prev, { ...color, id: nextPaletteId.current++ }])
      return
    }

    if (tool === 'crop') {
      e.currentTarget.setPointerCapture(e.pointerId)
      cropDragStartRef.current = point
      setCropRect({ x: point.x, y: point.y, width: 0, height: 0 })
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    const scale = getAnnotationScale(canvas.width)
    const hitId = hitTestAnnotationAnchor(palette, point.x, point.y, scale)
    if (hitId !== null) {
      const hitSwatch = palette.find((p) => p.id === hitId)
      if (hitSwatch?.annotation) {
        draggingExistingIdRef.current = hitId
        dragOffsetRef.current = { x: point.x - hitSwatch.annotation.anchor.x, y: point.y - hitSwatch.annotation.anchor.y }
        e.currentTarget.style.cursor = 'grabbing'
      }
      return
    }

    dragOriginRef.current = { point, color: sampleColorAt(canvas, ctx, point.x, point.y) }
    setDragAnchor(point)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const point = toCanvasPoint(e, canvas)

    if (tool === 'crop') {
      const start = cropDragStartRef.current
      if (!start) return
      setCropRect({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      })
      return
    }

    if (tool !== 'annotate') return

    if (draggingExistingIdRef.current !== null) {
      const id = draggingExistingIdRef.current
      const offset = dragOffsetRef.current ?? { x: 0, y: 0 }
      const anchor = { x: point.x - offset.x, y: point.y - offset.y }
      setPalette((prev) => prev.map((p) => (p.id === id && p.annotation ? { ...p, annotation: { ...p.annotation, anchor } } : p)))
      return
    }

    if (dragOriginRef.current) {
      setDragAnchor(point)
      return
    }

    // Not dragging: hint that an existing annotation can be picked up from here.
    const scale = getAnnotationScale(canvas.width)
    const hoverId = hitTestAnnotationAnchor(palette, point.x, point.y, scale)
    e.currentTarget.style.cursor = hoverId !== null ? 'grab' : 'crosshair'
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === 'crop') {
      e.currentTarget.releasePointerCapture(e.pointerId)
      cropDragStartRef.current = null
      return
    }

    if (tool !== 'annotate') return
    e.currentTarget.releasePointerCapture(e.pointerId)

    if (draggingExistingIdRef.current !== null) {
      draggingExistingIdRef.current = null
      dragOffsetRef.current = null
      e.currentTarget.style.cursor = 'grab'
      return
    }

    if (dragOriginRef.current && dragAnchor) {
      const { point: origin, color } = dragOriginRef.current
      setPalette((prev) => [...prev, { ...color, id: nextPaletteId.current++, annotation: { origin, anchor: dragAnchor } }])
    }
    dragOriginRef.current = null
    setDragAnchor(null)
  }

  function handleRemoveSwatch(id: number) {
    setPalette((prev) => prev.filter((color) => color.id !== id))
  }

  function handleClearPalette() {
    setPalette([])
  }

  function toggleStat(key: StatKey) {
    setVisibleStats((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleCopyPalette() {
    const hexes = sortedPalette.map((color) => color.hex).join(', ')
    navigator.clipboard.writeText(`\`\`\`palette\n${hexes}\n\`\`\``)
  }

  function handleGrayscale() {
    // toLuminanceGrayscale is synchronous and, on a large photo, slow enough to visibly freeze the
    // page — set the "processing" state first and defer the heavy work a tick so the spinner it
    // triggers actually gets painted before the main thread blocks.
    setIsProcessing(true)
    setTimeout(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        ctx.putImageData(toLuminanceGrayscale(imageData), 0, 0)
        setIsGrayscale(true)
      }
      setIsProcessing(false)
    }, 0)
  }

  function handleExtractPalette() {
    // Same defer-behind-a-spinner pattern as handleGrayscale: getImageData plus k-means over a
    // large canvas is enough work to visibly freeze the page otherwise.
    setIsProcessing(true)
    setTimeout(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const colors = extractPalette(imageData, paletteColorCount)
        const newSwatches = colors.map(({ r, g, b }) => ({
          hex: rgbToHex(r, g, b),
          ...rgbToOklch(r, g, b),
          id: nextPaletteId.current++,
        }))
        setPalette((prev) => [...prev, ...newSwatches])
      }
      setIsProcessing(false)
    }, 0)
  }

  function handleReset() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !originalImageData.current) return

    ctx.putImageData(originalImageData.current, 0, 0)
    setIsGrayscale(false)
  }

  function handleApplyCrop() {
    const canvas = canvasRef.current
    const overlay = overlayCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !overlay || !ctx || !cropRect || cropRect.width < 1 || cropRect.height < 1) return

    const cropped = ctx.getImageData(cropRect.x, cropRect.y, cropRect.width, cropRect.height)
    canvas.width = cropRect.width
    canvas.height = cropRect.height
    overlay.width = cropRect.width
    overlay.height = cropRect.height
    ctx.putImageData(cropped, 0, 0)
    originalImageData.current = cropped

    // Annotation positions are relative to the old canvas size and no longer make sense once it's
    // been cropped — drop the positions but keep the sampled colors themselves.
    setPalette((prev) => prev.map(({ annotation: _annotation, ...rest }) => rest))
    setCropRect(null)
    setTool('eyedropper')
  }

  function handleCancelCrop() {
    setCropRect(null)
    setTool('eyedropper')
  }

  // Composites the image canvas and the placed annotations into one offscreen canvas — the image
  // canvas and overlay canvas stay separate (so annotations remain editable and the original image
  // is never touched), but Save/Copy Image need them merged into a single flat picture.
  function renderFlattenedCanvas(): HTMLCanvasElement | null {
    const canvas = canvasRef.current
    if (!canvas) return null

    const flat = document.createElement('canvas')
    flat.width = canvas.width
    flat.height = canvas.height
    const ctx = flat.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(canvas, 0, 0)
    const theme = getThemeColors(canvas)
    const scale = getAnnotationScale(canvas.width)
    for (const swatch of palette) {
      if (swatch.annotation) drawAnnotation(ctx, swatch as PaletteColor & { annotation: Annotation }, theme, scale)
    }
    return flat
  }

  function handleSave() {
    const flat = renderFlattenedCanvas()
    if (!flat) return

    flat.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName.trim() || 'image'}${isGrayscale ? '-grayscale' : ''}.png`
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function handleCopyImage() {
    const flat = renderFlattenedCanvas()
    if (!flat) return

    flat.toBlob(async (blob) => {
      if (!blob) return
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      } catch {
        // Clipboard image writes can be unsupported or denied by the browser; there's no fallback,
        // and this app has no toast/status UI to surface the failure through.
      }
    }, 'image/png')
  }

  const sortedPalette = [...palette].sort((a, b) => (sortBy === 'chroma' ? b.c - a.c : b.l - a.l))

  return (
    <div className={styles.app}>
      <div className={styles.actions}>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
          {hasImage ? 'Load Image' : 'Choose Image'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className={styles.hiddenFileInput}
        />
        {hasImage && (
          <>
            <button
              type="button"
              onClick={() => selectTool('eyedropper')}
              disabled={isProcessing}
              className={tool === 'eyedropper' ? styles.toolActive : undefined}
            >
              Eyedropper
            </button>
            <button
              type="button"
              onClick={() => selectTool('annotate')}
              disabled={isProcessing}
              className={tool === 'annotate' ? styles.toolActive : undefined}
            >
              Annotate
            </button>
            <button
              type="button"
              onClick={() => selectTool('crop')}
              disabled={isProcessing}
              className={tool === 'crop' ? styles.toolActive : undefined}
            >
              Crop
            </button>
            {tool === 'crop' && (
              <>
                <button
                  type="button"
                  onClick={handleApplyCrop}
                  disabled={isProcessing || !cropRect || cropRect.width < 1 || cropRect.height < 1}
                >
                  Apply Crop
                </button>
                <button type="button" onClick={handleCancelCrop} disabled={isProcessing}>
                  Cancel
                </button>
              </>
            )}
            <button type="button" onClick={handleGrayscale} disabled={isGrayscale || isProcessing}>
              Grayscale
            </button>
            <button type="button" onClick={handleReset} disabled={!isGrayscale || isProcessing}>
              Reset
            </button>
            <button type="button" onClick={handleExtractPalette} disabled={isProcessing}>
              Extract Palette
            </button>
            <input
              type="number"
              min={MIN_PALETTE_COLORS}
              max={MAX_PALETTE_COLORS}
              value={paletteColorCount}
              onChange={(e) =>
                setPaletteColorCount(
                  Math.min(MAX_PALETTE_COLORS, Math.max(MIN_PALETTE_COLORS, Number(e.target.value) || DEFAULT_PALETTE_COLORS)),
                )
              }
              disabled={isProcessing}
              className={styles.fileNameInput}
              aria-label="Number of colors to extract"
            />
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="image"
              className={styles.fileNameInput}
            />
            <button type="button" onClick={handleCopyImage} disabled={isProcessing}>
              Copy Image
            </button>
            <button type="button" onClick={handleSave} disabled={isProcessing}>
              Save
            </button>
          </>
        )}
      </div>
      <div className={styles.workspace}>
        <div className={styles.canvasArea}>
          {!hasImage && <p className={styles.placeholder}>Choose or paste an image to get started.</p>}
          <div className={styles.canvasStack} style={{ display: hasImage ? 'block' : 'none' }}>
            <canvas ref={canvasRef} className={styles.canvas} />
            <canvas
              ref={overlayCanvasRef}
              className={styles.overlayCanvas}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>
          {isProcessing && (
            <div className={styles.spinnerOverlay}>
              <div className={styles.spinner} />
            </div>
          )}
        </div>
        {hasImage && (
          <div
            className={styles.samplePanel}
            style={canvasHeight !== null ? ({ '--panel-height': `${canvasHeight}px` } as React.CSSProperties) : undefined}
          >
            {palette.length === 0 ? (
              <p className={styles.placeholder}>Sampled colors will appear here.</p>
            ) : (
              <>
                <div className={styles.paletteActions}>
                  <button type="button" onClick={handleCopyPalette}>
                    Copy
                  </button>
                  <button type="button" onClick={handleClearPalette}>
                    Clear
                  </button>
                  <div className={styles.settingsWrapper} ref={settingsRef}>
                    <button
                      type="button"
                      className={styles.settingsButton}
                      onClick={() => setSettingsOpen((prev) => !prev)}
                      aria-label="Preview settings"
                      aria-expanded={settingsOpen}
                    >
                      <span className={styles.gearIcon} style={{ '--icon': `url(${gearIcon})` } as React.CSSProperties} />
                    </button>
                    {settingsOpen && (
                      <div className={styles.settingsMenu}>
                        <div className={styles.settingsSection}>
                          <span className={styles.settingsLabel}>Show</span>
                          {(Object.keys(STAT_LABELS) as StatKey[]).map((key) => (
                            <label key={key} className={styles.settingsCheckbox}>
                              <input type="checkbox" checked={visibleStats[key]} onChange={() => toggleStat(key)} />
                              {STAT_LABELS[key]}
                            </label>
                          ))}
                        </div>
                        <div className={styles.settingsSection}>
                          <span className={styles.settingsLabel}>Sort by</span>
                          <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as SortKey)}
                            className={styles.settingsSelect}
                          >
                            <option value="lightness">Lightness</option>
                            <option value="chroma">Chroma</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.paletteList}>
                  {sortedPalette.map((swatch) => (
                    <PaletteCard key={swatch.id} swatch={swatch} onRemove={handleRemoveSwatch} visibleStats={visibleStats} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PaletteCard({
  swatch,
  onRemove,
  visibleStats,
}: {
  swatch: PaletteColor
  onRemove: (id: number) => void
  visibleStats: Record<StatKey, boolean>
}) {
  return (
    <div className={styles.paletteCard}>
      <button
        type="button"
        className={styles.removeSwatch}
        onClick={() => onRemove(swatch.id)}
        aria-label={`Remove ${swatch.hex}`}
      >
        ×
      </button>
      <div className={styles.swatch} style={{ backgroundColor: swatch.hex }} />
      <div className={styles.statList}>
        {visibleStats.hex && <StatRow label="Hex" value={swatch.hex} />}
        {visibleStats.lightness && (
          <StatRow label="Lightness" value={`${lightnessPercent(swatch.l)}%`} fillPercent={lightnessPercent(swatch.l)} />
        )}
        {visibleStats.chroma && (
          <StatRow label="Chroma" value={swatch.c.toFixed(3)} fillPercent={chromaPercent(swatch.c)} />
        )}
        {visibleStats.hue && <StatRow label="Hue" value={`${Math.round(swatch.h)}°`} />}
      </div>
    </div>
  )
}

function StatRow({ label, value, fillPercent }: { label: string; value: string; fillPercent?: number }) {
  return (
    <div
      className={styles.statRow}
      style={fillPercent !== undefined ? ({ '--fill-percent': `${fillPercent}%` } as React.CSSProperties) : undefined}
    >
      {fillPercent !== undefined && <div className={styles.statFill} />}
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}

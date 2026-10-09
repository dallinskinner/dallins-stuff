import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  TRANSPARENT,
  flipHorizontal,
  flipVertical,
  hexToRgba,
  imageDataToGrid,
  usedColors,
} from './pixelGrid'
import type { DitherPattern } from './pixelGrid'
import { usePixelGrid } from './usePixelGrid'
import { PixelCanvas } from './PixelCanvas'
import { CanvasRulers } from './CanvasRulers'
import { PixelPreview } from './PixelPreview'
import { RecolorPanel } from './RecolorPanel'
import { ConsolePalettePanel } from './ConsolePalettePanel'
import type { ActiveSlot } from './ConsolePalettePanel'
import { MODES } from './modes'
import { convertGridToMode, isConstrained } from './modes/constraints'
import { prepareReferenceImage } from './referenceImage'
import { parseProject, serializeProject } from './projectFile'
import pencilIcon from '../../assets/icons/pencil.png'
import circleIcon from '../../assets/icons/circle.png'
import eraserIcon from '../../assets/icons/eraser.png'
import fillIcon from '../../assets/icons/fill.png'
import gradientIcon from '../../assets/icons/gradient.png'
import squareIcon from '../../assets/icons/square.png'
import lineIcon from '../../assets/icons/line.png'
import curveIcon from '../../assets/icons/curve.png'
import selectIcon from '../../assets/icons/select.png'
import undoIcon from '../../assets/icons/undo.png'
import redoIcon from '../../assets/icons/redo.png'
import trashIcon from '../../assets/icons/trash.png'
import styles from './PixelArtApp.module.css'

type Tool = 'brush' | 'eraser' | 'ellipse' | 'fill' | 'rectangle' | 'line' | 'curve' | 'select' | 'gradient'

const FREESTYLE_DEFAULT_ZOOM = 16
const CANVAS_ZOOM_MIN = 1
const CANVAS_ZOOM_MAX = 32
const PREVIEW_ZOOM_MIN = 1
/** Side length of the fixed preview frame; zoom is capped per-size so width/height * zoom never exceeds it. */
const MAX_PREVIEW = 128

export function PixelArtApp() {
  const [active, setActive] = useState<ActiveSlot>({ sp: 0, slot: 1 })
  const [strict, setStrict] = useState(true)
  const {
    grid,
    mode,
    palette: modePalette,
    owners,
    uniqueTiles,
    rejection,
    canUndo,
    canRedo,
    beginStroke,
    paintCell,
    paintCells,
    clear,
    resize,
    loadGrid,
    loadModeState,
    setPaletteEntry,
    setBackdrop,
    undo,
    redo,
  } = usePixelGrid(GRID_WIDTH, GRID_HEIGHT, active.sp, strict)
  const [colorHex, setColorHex] = useState('#000000')
  const [secondaryHex, setSecondaryHex] = useState('#ffffff')
  const [secondarySlot, setSecondarySlot] = useState(0)
  const [ditherPattern, setDitherPattern] = useState<DitherPattern>('bayer')
  const [ditherSize, setDitherSize] = useState(4)
  const [fileName, setFileName] = useState('pixel-art')
  const [tool, setTool] = useState<Tool>('brush')
  const [showGrid, setShowGrid] = useState(true)
  const [showRulers, setShowRulers] = useState(true)
  const [crt, setCrt] = useState(false)
  const [previewZoom, setPreviewZoom] = useState<number>(1)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [referenceVisible, setReferenceVisible] = useState(true)
  const [referenceOpacity, setReferenceOpacity] = useState(0.4)
  const [referenceAdjusting, setReferenceAdjusting] = useState(false)
  const [referenceScale, setReferenceScale] = useState(1)
  const [referenceOffset, setReferenceOffset] = useState({ x: 0, y: 0 })
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const [showTiles, setShowTiles] = useState(true)
  const [showRegions, setShowRegions] = useState(true)
  const [canvasZoom, setCanvasZoom] = useState<number>(FREESTYLE_DEFAULT_ZOOM)
  const [transformOpen, setTransformOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [recolorOpen, setRecolorOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transformRef = useRef<HTMLDivElement>(null)
  const projectRef = useRef<HTMLDivElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const recolorRef = useRef<HTMLDivElement>(null)
  const canvasViewportRef = useRef<HTMLDivElement>(null)
  const canvasZoomRef = useRef(canvasZoom)
  /** The grid point under the cursor when a wheel zoom started, and where on screen it must stay. */
  const zoomAnchorRef = useRef<{ row: number; col: number; clientX: number; clientY: number } | null>(null)

  const palette = useMemo(() => usedColors(grid), [grid])

  const constrained = isConstrained(mode)
  const backdrop = useMemo(
    () => (mode.slot0 === 'backdrop' ? hexToRgba(modePalette.backdrop) : undefined),
    [mode.slot0, modePalette.backdrop],
  )
  // In constrained modes the paint color is always a slot of the active subpalette; slot 0 paints "nothing" (backdrop/transparent).
  const paintColor = !constrained
    ? hexToRgba(colorHex)
    : active.slot === 0
      ? TRANSPARENT
      : hexToRgba(modePalette.subpalettes[active.sp][active.slot - 1])
  const secondaryEntry = constrained && secondarySlot > 0 ? modePalette.subpalettes[active.sp]?.[secondarySlot - 1] : undefined
  const secondaryColor = !constrained ? hexToRgba(secondaryHex) : secondaryEntry ? hexToRgba(secondaryEntry) : TRANSPARENT
  const secondaryDisplayHex = !constrained
    ? secondaryHex
    : secondaryEntry ?? (secondarySlot === 0 && mode.slot0 === 'backdrop' ? modePalette.backdrop : undefined)
  const paintHex = !constrained
    ? colorHex
    : active.slot === 0
      ? mode.slot0 === 'backdrop'
        ? modePalette.backdrop
        : undefined
      : modePalette.subpalettes[active.sp][active.slot - 1]

  const height = grid.length
  const width = grid[0]?.length ?? 0
  const cellSize = canvasZoom
  const previewZoomMax = Math.max(1, Math.floor(MAX_PREVIEW / Math.max(width, height)))
  // Grids larger than the frame (e.g. NES) can't fit even at 1x, so scale them down to fit instead of offering integer zoom.
  const previewFitScale = MAX_PREVIEW / Math.max(width, height)
  const previewShrunk = previewFitScale < 1
  const activePreset = mode.sizes.find((p) => p.width === width && p.height === height)?.id ?? ''

  // Frees the previous reference image's blob when it's replaced or the app closes.
  useEffect(() => {
    if (!referenceUrl) return
    return () => URL.revokeObjectURL(referenceUrl)
  }, [referenceUrl])

  useEffect(() => {
    if (previewZoom > previewZoomMax) setPreviewZoom(previewZoomMax)
  }, [previewZoom, previewZoomMax])

  useEffect(() => {
    if (!transformOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (!transformRef.current?.contains(e.target as Node)) setTransformOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [transformOpen])

  useEffect(() => {
    if (!projectOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (!projectRef.current?.contains(e.target as Node)) setProjectOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [projectOpen])

  useEffect(() => {
    if (!paletteOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (!paletteRef.current?.contains(e.target as Node)) setPaletteOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [paletteOpen])

  useEffect(() => {
    if (!recolorOpen) return
    function handlePointerDown(e: PointerEvent) {
      if (!recolorRef.current?.contains(e.target as Node)) setRecolorOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [recolorOpen])

  // Ctrl+wheel zooms the editing canvas toward the cursor; a plain wheel scrolls the viewport natively. React makes
  // onWheel passive, so preventDefault (needed to stop the browser's own page zoom) requires a native listener.
  useEffect(() => {
    const el = canvasViewportRef.current
    if (!el) return
    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey) return
      e.preventDefault()
      const canvas = canvasRef.current
      const current = canvasZoomRef.current
      const next = Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, current + (e.deltaY < 0 ? 1 : -1)))
      if (next === current) return
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        zoomAnchorRef.current = {
          row: (e.clientY - rect.top) / current,
          col: (e.clientX - rect.left) / current,
          clientX: e.clientX,
          clientY: e.clientY,
        }
      }
      canvasZoomRef.current = next
      setCanvasZoom(next)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // After a wheel zoom has resized the canvas, scroll so the anchored grid point is back under the cursor.
  useLayoutEffect(() => {
    canvasZoomRef.current = canvasZoom
    const anchor = zoomAnchorRef.current
    zoomAnchorRef.current = null
    const viewport = canvasViewportRef.current
    const canvas = canvasRef.current
    if (!anchor || !viewport || !canvas) return
    const rect = canvas.getBoundingClientRect()
    viewport.scrollLeft += rect.left + anchor.col * canvasZoom - anchor.clientX
    viewport.scrollTop += rect.top + anchor.row * canvasZoom - anchor.clientY
  }, [canvasZoom])

  function handleSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const preset = mode.sizes.find((p) => p.id === e.target.value)
    if (!preset) return
    resize(preset.width, preset.height)
    setCanvasZoom(preset.defaultZoom)
  }

  function resetReferenceTransform() {
    setReferenceScale(1)
    setReferenceOffset({ x: 0, y: 0 })
  }

  async function handleReferenceLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setReferenceUrl(URL.createObjectURL(await prepareReferenceImage(file)))
      setReferenceVisible(true)
      resetReferenceTransform()
    } catch (err) {
      window.alert(`Couldn't open reference image: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  function handleModeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = MODES.find((m) => m.id === e.target.value)
    if (!next || next.id === mode.id) return
    if (!isConstrained(next)) {
      loadModeState(next, grid, next.defaultPalette, [])
      return
    }
    const hasArt = grid.some((row) => row.some((cell) => cell.a !== 0))
    if (hasArt && !window.confirm(`Convert this artwork to ${next.label}? Colors will be snapped to the hardware palette and detail it can't hold is dropped (you can undo).`)) {
      return
    }
    const converted = convertGridToMode(grid, next)
    loadModeState(next, converted.grid, converted.palette, converted.owners)
    setActive({ sp: 0, slot: 1 })
    setSecondarySlot(0)
    setCanvasZoom(converted.size.defaultZoom)
  }

  function handleEditEntry(slot: ActiveSlot, hex: string): boolean {
    return slot.slot === 0 ? setBackdrop(hex) : setPaletteEntry(slot.sp, slot.slot, hex)
  }

  function zoomIn() {
    setCanvasZoom((z) => Math.min(CANVAS_ZOOM_MAX, z + 1))
  }

  function zoomOut() {
    setCanvasZoom((z) => Math.max(CANVAS_ZOOM_MIN, z - 1))
  }

  function handleFlipHorizontal() {
    loadGrid(flipHorizontal(grid))
    setTransformOpen(false)
  }

  function handleFlipVertical() {
    loadGrid(flipVertical(grid))
    setTransformOpen(false)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName.trim() || 'pixel-art'}.png`
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  function handleProjectSave() {
    setProjectOpen(false)
    const json = serializeProject({ mode, grid, palette: modePalette, owners, zoom: canvasZoom })
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName.trim() || 'pixel-art'}.pixelproject.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleProjectLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const project = parseProject(await file.text())
      loadModeState(project.mode, project.grid, project.palette, project.owners)
      setCanvasZoom(project.zoom)
      setActive({ sp: 0, slot: 1 })
      setSecondarySlot(0)
      setFileName(file.name.replace(/(\.pixelproject)?\.json$/i, '') || 'pixel-art')
    } catch (err) {
      window.alert(`Couldn't open project: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
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
    const loaded = imageDataToGrid(ctx.getImageData(0, 0, width, height))
    if (!constrained) {
      loadGrid(loaded)
      return
    }
    const converted = convertGridToMode(loaded, mode)
    loadModeState(mode, converted.grid, converted.palette, converted.owners)
  }

  return (
    <div className={styles.app}>
      <div className={styles.workspace}>
        <div className={styles.toolPanel}>
          <div className={styles.toolButtons}>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'select'}
              aria-label="Select"
              onClick={() => setTool('select')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${selectIcon})` } as React.CSSProperties} />
            </button>
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
              aria-pressed={tool === 'line'}
              aria-label="Line"
              onClick={() => setTool('line')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${lineIcon})` } as React.CSSProperties} />
            </button>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'curve'}
              aria-label="Curve"
              onClick={() => setTool('curve')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${curveIcon})` } as React.CSSProperties} />
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
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'gradient'}
              aria-label="Gradient"
              onClick={() => setTool('gradient')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${gradientIcon})` } as React.CSSProperties} />
            </button>
          </div>
          {tool === 'gradient' && (
            <label className={styles.ditherOption}>
              Pattern
              <select value={ditherPattern} onChange={(e) => setDitherPattern(e.target.value as DitherPattern)}>
                <option value="bayer">Bayer</option>
                <option value="lines">Lines</option>
                <option value="diagonal">Diagonal</option>
                <option value="dots">Dots</option>
              </select>
            </label>
          )}
          {tool === 'gradient' && (
            <label className={styles.ditherOption}>
              Size
              <select value={ditherSize} onChange={(e) => setDitherSize(Number(e.target.value))}>
                <option value={2}>2×2</option>
                <option value={4}>4×4</option>
                <option value={8}>8×8</option>
                <option value={16}>16×16</option>
              </select>
            </label>
          )}
          <div className={styles.colorRow}>
            <label
              className={styles.activeColor}
              style={paintHex ? { backgroundColor: paintHex } : undefined}
              aria-label="Active color"
            >
              {!constrained && (
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => setColorHex(e.target.value)}
                  className={styles.hiddenColorInput}
                />
              )}
            </label>
            {tool === 'gradient' && (
              <label
                className={styles.activeColor}
                style={secondaryDisplayHex ? { backgroundColor: secondaryDisplayHex } : undefined}
                aria-label="Secondary color"
              >
                {!constrained && (
                  <input
                    type="color"
                    value={secondaryHex}
                    onChange={(e) => setSecondaryHex(e.target.value)}
                    className={styles.hiddenColorInput}
                  />
                )}
              </label>
            )}
            {!constrained && (
            <div className={styles.paletteDropdown} ref={paletteRef}>
              <button
                type="button"
                className={styles.paletteButton}
                aria-expanded={paletteOpen}
                aria-label="Colors used in this artwork"
                onClick={() => setPaletteOpen((open) => !open)}
              >
                <span className={styles.paletteIcon} />
              </button>
              {paletteOpen && (
                <div className={styles.palettePopover}>
                  {palette.length === 0 ? (
                    <p className={styles.paletteEmpty}>No colors yet</p>
                  ) : (
                    palette.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className={styles.paletteSwatch}
                        style={{ backgroundColor: hex }}
                        aria-label={hex}
                        aria-pressed={hex.toLowerCase() === colorHex.toLowerCase()}
                        onClick={() => {
                          setColorHex(hex)
                          setPaletteOpen(false)
                        }}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        </div>
        <div className={styles.canvasViewport} ref={canvasViewportRef}>
          <CanvasRulers width={width} height={height} cellSize={cellSize} enabled={showRulers}>
            <PixelCanvas
              ref={canvasRef}
              grid={grid}
              width={width}
              height={height}
              cellSize={cellSize}
              tool={tool}
              color={paintColor}
              secondaryColor={secondaryColor}
              ditherPattern={ditherPattern}
            ditherSize={ditherSize}
              showGrid={showGrid}
              crt={crt}
              backdrop={backdrop}
              reference={
                referenceUrl && referenceVisible
                  ? {
                      url: referenceUrl,
                      opacity: referenceOpacity,
                      x: referenceOffset.x,
                      y: referenceOffset.y,
                      scale: referenceScale,
                      adjusting: referenceAdjusting,
                      onMove: (x, y) => setReferenceOffset({ x, y }),
                    }
                  : undefined
              }
              hardware={
                constrained
                  ? { regionSize: mode.regionSize, owners, showTiles, showRegions, rejection }
                  : undefined
              }
              onBeginStroke={beginStroke}
              onPaintCell={paintCell}
              onPaintCells={paintCells}
            />
          </CanvasRulers>
        </div>
        <div className={styles.actions}>
          <div className={styles.buttonRow}>
            <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo">
              <span className={styles.historyIcon} style={{ '--icon': `url(${undoIcon})` } as React.CSSProperties} />
            </button>
            <button type="button" onClick={redo} disabled={!canRedo} aria-label="Redo">
              <span className={styles.historyIcon} style={{ '--icon': `url(${redoIcon})` } as React.CSSProperties} />
            </button>
            <button type="button" onClick={clear} aria-label="Clear">
              <span className={styles.historyIcon} style={{ '--icon': `url(${trashIcon})` } as React.CSSProperties} />
            </button>
          </div>
          <input
            type="text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="pixel-art"
            className={styles.fileNameInput}
          />
          <div className={styles.buttonRow}>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Load
            </button>
            <button type="button" onClick={handleSave}>
              Save
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png"
            onChange={handleLoad}
            className={styles.hiddenFileInput}
          />
          <div className={styles.dropdown} ref={projectRef}>
            <button type="button" aria-expanded={projectOpen} onClick={() => setProjectOpen((open) => !open)}>
              Project ▾
            </button>
            {projectOpen && (
              <div className={styles.dropdownMenu}>
                <button type="button" onClick={handleProjectSave}>
                  Save project
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProjectOpen(false)
                    projectInputRef.current?.click()
                  }}
                >
                  Open project
                </button>
              </div>
            )}
          </div>
          <input
            ref={projectInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleProjectLoad}
            className={styles.hiddenFileInput}
          />
          <div className={styles.dropdown} ref={transformRef}>
            <button
              type="button"
              aria-expanded={transformOpen}
              onClick={() => setTransformOpen((open) => !open)}
            >
              Transform ▾
            </button>
            {transformOpen && (
              <div className={styles.dropdownMenu}>
                <button type="button" onClick={handleFlipHorizontal}>
                  Flip H
                </button>
                <button type="button" onClick={handleFlipVertical}>
                  Flip V
                </button>
              </div>
            )}
          </div>
          {constrained ? (
            <ConsolePalettePanel
              mode={mode}
              palette={modePalette}
              active={active}
              onSelect={setActive}
              secondarySlot={secondarySlot}
              onSelectSecondary={setSecondarySlot}
              onEditEntry={handleEditEntry}
            />
          ) : (
            <div className={styles.dropdown} ref={recolorRef}>
              <button type="button" aria-expanded={recolorOpen} onClick={() => setRecolorOpen((open) => !open)}>
                Recolor ▾
              </button>
              {recolorOpen && (
                <RecolorPanel grid={grid} palette={palette} onBeginStroke={beginStroke} onPaintCells={paintCells} />
              )}
            </div>
          )}
        </div>
        <div className={styles.previewCorner}>
          <label className={styles.zoomSlider}>
            {previewShrunk ? 'Preview (fit)' : `Preview ${previewZoom}x`}
            <input
              type="range"
              disabled={previewShrunk}
              min={PREVIEW_ZOOM_MIN}
              max={previewZoomMax}
              step={1}
              value={previewZoom}
              onChange={(e) => setPreviewZoom(Number(e.target.value))}
            />
          </label>
          <PixelPreview grid={grid} width={width} height={height} zoom={previewShrunk ? previewFitScale : previewZoom} maxSize={MAX_PREVIEW} backdrop={backdrop} crt={crt} />
        </div>
      </div>
      <div className={styles.bottomBar}>
        <select aria-label="Console" value={mode.id} onChange={handleModeChange}>
          {MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select aria-label="Size" value={activePreset} onChange={handleSizeChange} disabled={mode.sizes.length < 2}>
          {mode.sizes.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
        <label>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show Grid
        </label>
        <label>
          <input type="checkbox" checked={showRulers} onChange={(e) => setShowRulers(e.target.checked)} />
          Rulers
        </label>
        <label title="Presentation mode: shows the art with a CRT look. Doesn't change the artwork.">
          <input type="checkbox" checked={crt} onChange={(e) => setCrt(e.target.checked)} />
          CRT
        </label>
        {constrained && (
          <>
            <label>
              <input type="checkbox" checked={showTiles} onChange={(e) => setShowTiles(e.target.checked)} />
              Tiles
            </label>
            <label>
              <input type="checkbox" checked={showRegions} onChange={(e) => setShowRegions(e.target.checked)} />
              Palette areas
            </label>
            <label title="On: paints that would exceed the tile budget are refused. Off: you can go over it (the counter turns red).">
              <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
              Strict
            </label>
            <span className={uniqueTiles !== null && uniqueTiles > mode.maxUniqueTiles ? styles.overBudget : undefined}>
              Tiles {uniqueTiles} / {mode.maxUniqueTiles}
            </span>
          </>
        )}
        <div className={styles.referenceControl}>
          <button type="button" onClick={() => referenceInputRef.current?.click()}>
            {referenceUrl ? 'Change reference' : 'Reference…'}
          </button>
          {referenceUrl && (
            <>
              <label>
                <input type="checkbox" checked={referenceVisible} onChange={(e) => setReferenceVisible(e.target.checked)} />
                Show
              </label>
              <input
                type="range"
                aria-label="Reference opacity"
                min={0.05}
                max={1}
                step={0.05}
                value={referenceOpacity}
                disabled={!referenceVisible}
                onChange={(e) => setReferenceOpacity(Number(e.target.value))}
              />
              <label>
                <input
                  type="checkbox"
                  checked={referenceAdjusting}
                  disabled={!referenceVisible}
                  onChange={(e) => setReferenceAdjusting(e.target.checked)}
                />
                Move
              </label>
              <input
                type="range"
                aria-label="Reference size"
                min={0.1}
                max={4}
                step={0.05}
                value={referenceScale}
                disabled={!referenceVisible}
                onChange={(e) => setReferenceScale(Number(e.target.value))}
              />
              <span>{Math.round(referenceScale * 100)}%</span>
              <button type="button" onClick={resetReferenceTransform}>
                Reset
              </button>
              <button
                type="button"
                aria-label="Remove reference"
                onClick={() => {
                  setReferenceUrl(null)
                  setReferenceAdjusting(false)
                }}
              >
                ✕
              </button>
            </>
          )}
          <input
            ref={referenceInputRef}
            type="file"
            accept="image/*"
            onChange={handleReferenceLoad}
            className={styles.hiddenFileInput}
          />
        </div>
        <div className={styles.canvasZoomControl}>
          <button type="button" onClick={zoomOut} disabled={canvasZoom <= CANVAS_ZOOM_MIN} aria-label="Zoom out">
            −
          </button>
          <span>Zoom {canvasZoom}x</span>
          <button type="button" onClick={zoomIn} disabled={canvasZoom >= CANVAS_ZOOM_MAX} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>
    </div>
  )
}

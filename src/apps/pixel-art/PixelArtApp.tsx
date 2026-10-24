import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  GRID_HEIGHT,
  GRID_WIDTH,
  TRANSPARENT,
  flipHorizontal,
  colorCounts,
  flipVertical,
  hexToRgba,
  imageDataToGrid,
  rgbaToHex,
  usedColors,
} from './pixelGrid'
import type { DitherPattern } from './pixelGrid'
import { usePixelGrid } from './usePixelGrid'
import { PixelCanvas } from './PixelCanvas'
import { CanvasRulers } from './CanvasRulers'
import { PixelPreview } from './PixelPreview'
import { RecolorPanel } from './RecolorPanel'
import { ConsolePalettePanel } from './ConsolePalettePanel'
import { Dropdown } from './Dropdown'
import { HardwarePanel } from './HardwarePanel'
import { useMessageTargets, useWindowFocus } from '../../desktop/WindowManager'
import type { Selection } from './selection'
import type { ActiveSlot } from './ConsolePalettePanel'
import { MODES } from './modes'
import { convertGridToMode, isConstrained } from './modes/constraints'
import { prepareReferenceImage } from './referenceImage'
import { parseProject, serializeProject } from './projectFile'
import { loadAutosave, writeAutosave } from './autosave'
import pencilIcon from '../../assets/icons/pencil.png'
import circleIcon from '../../assets/icons/circle.png'
import eraserIcon from '../../assets/icons/eraser.png'
import fillIcon from '../../assets/icons/fill.png'
import gradientIcon from '../../assets/icons/gradient.png'
import squareIcon from '../../assets/icons/square.png'
import lineIcon from '../../assets/icons/line.png'
import curveIcon from '../../assets/icons/curve.png'
import selectIcon from '../../assets/icons/select.png'
import wandIcon from '../../assets/icons/wand.png'
import undoIcon from '../../assets/icons/undo.png'
import redoIcon from '../../assets/icons/redo.png'
import trashIcon from '../../assets/icons/trash.png'
import styles from './PixelArtApp.module.css'

type Tool = 'brush' | 'eraser' | 'ellipse' | 'fill' | 'rectangle' | 'line' | 'curve' | 'select' | 'wand' | 'gradient'

/** Tools that act on the selection (the fill and gradient stay inside it); switching among them keeps it. */
const SELECTION_TOOLS: Tool[] = ['select', 'wand', 'gradient', 'fill']

const FREESTYLE_DEFAULT_ZOOM = 16
const CANVAS_ZOOM_MIN = 1
const CANVAS_ZOOM_MAX = 32
const PREVIEW_ZOOM_MIN = 1
/** Side length of the fixed preview frame; zoom is capped per-size so width/height * zoom never exceeds it. */
const MAX_PREVIEW = 128
/** How long edits must pause before the project is autosaved. */
const AUTOSAVE_DELAY = 500

export function PixelArtApp() {
  // Read once: the editor starts from the last autosave, if there is one.
  const [restored] = useState(loadAutosave)
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
  } = usePixelGrid(GRID_WIDTH, GRID_HEIGHT, active.sp, strict, restored?.project)
  const [colorHex, setColorHex] = useState('#000000')
  const [secondaryHex, setSecondaryHex] = useState('#ffffff')
  const [secondarySlot, setSecondarySlot] = useState(0)
  /** Freestyle only: which gradient ends paint transparent instead of their color (constrained modes use slot 0). */
  const [gradientClear, setGradientClear] = useState({ start: false, end: false })
  const [ditherPattern, setDitherPattern] = useState<DitherPattern>('bayer')
  const [ditherSize, setDitherSize] = useState(4)
  const [fileName, setFileName] = useState(restored?.fileName ?? 'pixel-art')
  const [tool, setTool] = useState<Tool>('brush')
  const [showGrid, setShowGrid] = useState(true)
  const [showRulers, setShowRulers] = useState(false)
  const [previewZoom, setPreviewZoom] = useState<number>(1)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [referenceVisible, setReferenceVisible] = useState(true)
  const [referenceOpacity, setReferenceOpacity] = useState(0.4)
  const [referenceAdjusting, setReferenceAdjusting] = useState(false)
  const [referenceScale, setReferenceScale] = useState(1)
  const [referenceOffset, setReferenceOffset] = useState({ x: 0, y: 0 })
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const [showTiles, setShowTiles] = useState(false)
  const [showRegions, setShowRegions] = useState(false)
  const [canvasZoom, setCanvasZoom] = useState<number>(restored?.project.zoom ?? FREESTYLE_DEFAULT_ZOOM)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const appRef = useRef<HTMLDivElement>(null)
  const canvasViewportRef = useRef<HTMLDivElement>(null)
  const canvasZoomRef = useRef(canvasZoom)
  /** The grid point under the cursor when a wheel zoom started, and where on screen it must stay. */
  const zoomAnchorRef = useRef<{ row: number; col: number; clientX: number; clientY: number } | null>(null)

  const palette = useMemo(() => usedColors(grid), [grid])
  const paletteTargets = useMessageTargets('palette')

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
  const secondaryColor = !constrained
    ? gradientClear.end
      ? TRANSPARENT
      : hexToRgba(secondaryHex)
    : secondaryEntry
      ? hexToRgba(secondaryEntry)
      : TRANSPARENT
  const secondaryDisplayHex = !constrained
    ? gradientClear.end
      ? undefined
      : secondaryHex
    : secondaryEntry ?? (secondarySlot === 0 && mode.slot0 === 'backdrop' ? modePalette.backdrop : undefined)
  const gradientStartClear = tool === 'gradient' && !constrained && gradientClear.start
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
  const [selection, setSelection] = useState<Selection | null>(null)
  // The selection survives switching among the tools that use it, but not to other tools or a new canvas size.
  const [selectionContext, setSelectionContext] = useState({ tool, width, height })
  if (selectionContext.tool !== tool || selectionContext.width !== width || selectionContext.height !== height) {
    const keep =
      SELECTION_TOOLS.includes(selectionContext.tool) &&
      SELECTION_TOOLS.includes(tool) &&
      selectionContext.width === width &&
      selectionContext.height === height
    setSelectionContext({ tool, width, height })
    if (selection && !keep) setSelection(null)
  }

  // Recolor only offers (and only changes) colors inside the selection, when there is one.
  const recolorPalette = useMemo(() => {
    if (!selection) return palette
    const inSelection = new Set<string>()
    for (const { row, col } of selection.cells) {
      const cell = grid[row]?.[col]
      if (cell && cell.a !== 0) inSelection.add(rgbaToHex(cell))
    }
    return palette.filter((hex) => inSelection.has(hex))
  }, [selection, grid, palette])

  // Delete/Backspace erases the selected pixels (one undo step); Escape deselects. Only while this window is
  // focused and not while typing in a field.
  const { isFocused } = useWindowFocus()
  const selectionKeysRef = useRef<(e: KeyboardEvent) => void>(() => {})
  useLayoutEffect(() => {
    selectionKeysRef.current = (e) => {
      if (!selection || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelection(null)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        beginStroke()
        paintCells(selection.cells, TRANSPARENT)
      }
    }
  })
  useEffect(() => {
    if (!isFocused) return
    const handleKeyDown = (e: KeyboardEvent) => selectionKeysRef.current(e)
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFocused])

  const activePreset = mode.sizes.find((p) => p.width === width && p.height === height)?.id ?? ''

  // Frees the previous reference image's blob when it's replaced or the app closes.
  useEffect(() => {
    if (!referenceUrl) return
    return () => URL.revokeObjectURL(referenceUrl)
  }, [referenceUrl])

  useEffect(() => {
    if (previewZoom > previewZoomMax) setPreviewZoom(previewZoomMax)
  }, [previewZoom, previewZoomMax])

  // Ctrl+wheel (what a trackpad pinch sends in Chrome/Firefox) zooms the editing canvas toward the cursor; a plain
  // wheel scrolls the viewport natively. React makes onWheel passive, so preventDefault (needed to stop the browser's
  // own page zoom) requires a native listener. Safari sends gesture* events instead of ctrl+wheel for a pinch.
  useEffect(() => {
    const root = appRef.current
    const el = canvasViewportRef.current
    if (!root || !el) return

    function zoomBy(direction: 1 | -1, clientX: number, clientY: number) {
      const canvas = canvasRef.current
      const current = canvasZoomRef.current
      const next = Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, current + direction))
      if (next === current) return
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        zoomAnchorRef.current = {
          row: (clientY - rect.top) / current,
          col: (clientX - rect.left) / current,
          clientX,
          clientY,
        }
      }
      canvasZoomRef.current = next
      setCanvasZoom(next)
    }

    function handleWheel(e: WheelEvent) {
      if (!e.ctrlKey || !root!.contains(e.target as Node)) return
      // Stop the page zoom wherever the pinch lands in the window, but only zoom the canvas when over its viewport.
      e.preventDefault()
      if (el!.contains(e.target as Node)) zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY)
    }

    let lastScale = 1
    function handleGestureStart(e: Event) {
      if (!root!.contains(e.target as Node)) return
      e.preventDefault()
      lastScale = 1
    }
    function handleGestureChange(e: Event) {
      if (!root!.contains(e.target as Node)) return
      e.preventDefault()
      if (!el!.contains(e.target as Node)) return
      // iPadOS's GestureEvent may carry no pointer position, so fall back to the viewport's center.
      const g = e as Event & { scale: number; clientX?: number; clientY?: number }
      const rect = el!.getBoundingClientRect()
      const scale = g.scale
      const clientX = g.clientX ?? rect.left + rect.width / 2
      const clientY = g.clientY ?? rect.top + rect.height / 2
      // One zoom step per ~15% of pinch.
      if (scale / lastScale > 1.15) {
        lastScale = scale
        zoomBy(1, clientX, clientY)
      } else if (scale / lastScale < 1 / 1.15) {
        lastScale = scale
        zoomBy(-1, clientX, clientY)
      }
    }
    function handleGestureEnd(e: Event) {
      if (root!.contains(e.target as Node)) e.preventDefault()
    }

    // On the document in the capture phase, so nothing between here and the root can swallow the event first.
    const opts = { passive: false, capture: true } as const
    document.addEventListener('wheel', handleWheel, opts)
    document.addEventListener('gesturestart', handleGestureStart, opts)
    document.addEventListener('gesturechange', handleGestureChange, opts)
    document.addEventListener('gestureend', handleGestureEnd, opts)
    return () => {
      document.removeEventListener('wheel', handleWheel, opts)
      document.removeEventListener('gesturestart', handleGestureStart, opts)
      document.removeEventListener('gesturechange', handleGestureChange, opts)
      document.removeEventListener('gestureend', handleGestureEnd, opts)
    }
  }, [])

  /** Scrolls the viewport so the anchored grid point sits at its target screen position, at the given zoom. */
  function scrollToAnchor(anchor: { row: number; col: number; clientX: number; clientY: number }, zoom: number) {
    const viewport = canvasViewportRef.current
    const canvas = canvasRef.current
    if (!viewport || !canvas) return
    const rect = canvas.getBoundingClientRect()
    viewport.scrollLeft += rect.left + anchor.col * zoom - anchor.clientX
    viewport.scrollTop += rect.top + anchor.row * zoom - anchor.clientY
  }

  // After a wheel or pinch zoom has resized the canvas, scroll so the anchored grid point is back under the cursor.
  useLayoutEffect(() => {
    canvasZoomRef.current = canvasZoom
    const anchor = zoomAnchorRef.current
    zoomAnchorRef.current = null
    if (anchor) scrollToAnchor(anchor, canvasZoom)
  }, [canvasZoom])

  // Two-finger touch: pinching zooms the canvas about the fingers' midpoint, and the midpoint dragging pans it.
  // The grid point under the midpoint when the pinch starts stays under it throughout. Pens and mice are ignored,
  // so Apple Pencil still draws. (PixelCanvas abandons any stroke the first finger started.)
  useEffect(() => {
    const el = canvasViewportRef.current
    if (!el) return
    const touches = new Map<number, { x: number; y: number }>()
    let pinch: { distance: number; zoom: number; row: number; col: number } | null = null

    function measure() {
      const [a, b] = [...touches.values()]
      return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }

    function handleDown(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const canvas = canvasRef.current
      if (touches.size !== 2 || !canvas) return
      const mid = measure()
      const rect = canvas.getBoundingClientRect()
      const zoom = canvasZoomRef.current
      pinch = { distance: mid.distance, zoom, row: (mid.y - rect.top) / zoom, col: (mid.x - rect.left) / zoom }
    }

    function handleMove(e: PointerEvent) {
      if (!touches.has(e.pointerId)) return
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!pinch || touches.size !== 2) return
      const mid = measure()
      const next = Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, Math.round((pinch.zoom * mid.distance) / pinch.distance)))
      const anchor = { row: pinch.row, col: pinch.col, clientX: mid.x, clientY: mid.y }
      if (next === canvasZoomRef.current) {
        scrollToAnchor(anchor, next)
      } else {
        zoomAnchorRef.current = anchor
        canvasZoomRef.current = next
        setCanvasZoom(next)
      }
    }

    function handleEnd(e: PointerEvent) {
      touches.delete(e.pointerId)
      pinch = null
    }

    el.addEventListener('pointerdown', handleDown)
    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerup', handleEnd)
    el.addEventListener('pointercancel', handleEnd)
    return () => {
      el.removeEventListener('pointerdown', handleDown)
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerup', handleEnd)
      el.removeEventListener('pointercancel', handleEnd)
    }
  }, [])

  // Autosaves shortly after edits stop, and right away when the window closes or the page unloads, so a refresh picks
  // up where you left off. Undo history and the reference image aren't saved.
  const pendingSaveRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const save = () => {
      pendingSaveRef.current = null
      writeAutosave(serializeProject({ mode, grid, palette: modePalette, owners, zoom: canvasZoom }), fileName)
    }
    pendingSaveRef.current = save
    const timer = window.setTimeout(save, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [mode, grid, modePalette, owners, canvasZoom, fileName])

  useEffect(() => {
    const flush = () => pendingSaveRef.current?.()
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

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
    setShowTiles(false)
    setShowRegions(false)
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
  }

  function handleFlipVertical() {
    loadGrid(flipVertical(grid))
  }

  /** Sends the artwork's colors, weighted by pixel count, to another app (e.g. Color Palette). */
  function sendPalette(send: (typeof paletteTargets)[number]['send']) {
    const transparentAs = constrained && mode.slot0 === 'backdrop' ? modePalette.backdrop : undefined
    send({ type: 'palette', colors: colorCounts(grid, transparentAs).map(({ hex, count }) => ({ hex, weight: count })) })
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
    <div className={styles.app} ref={appRef}>
      <div className={styles.menuBar}>
        <div className={styles.historyButtons}>
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
        <span className={styles.menuSeparator} />
        <Dropdown label="File">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Load PNG…
          </button>
          <button type="button" onClick={handleSave}>
            Save PNG
          </button>
          <button type="button" onClick={() => projectInputRef.current?.click()}>
            Open project…
          </button>
          <button type="button" onClick={handleProjectSave}>
            Save project
          </button>
        </Dropdown>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          onChange={handleLoad}
          className={styles.hiddenFileInput}
        />
        <input
          ref={projectInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleProjectLoad}
          className={styles.hiddenFileInput}
        />
        <Dropdown label="Image">
          <button type="button" onClick={handleFlipHorizontal}>
            Flip horizontal
          </button>
          <button type="button" onClick={handleFlipVertical}>
            Flip vertical
          </button>
        </Dropdown>
        <input
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          placeholder="pixel-art"
          aria-label="File name"
          className={styles.fileNameInput}
        />
      </div>
      <div className={styles.workspace}>
        <div className={styles.toolPanel}>
          <div className={styles.toolButtons}>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'select'}
              aria-label="Select"
              title="Select (Shift adds, Alt subtracts; drag inside to move)"
              onClick={() => setTool('select')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${selectIcon})` } as React.CSSProperties} />
            </button>
            <button
              type="button"
              className={styles.toolButton}
              aria-pressed={tool === 'wand'}
              aria-label="Flood select"
              title="Flood select (Shift adds, Alt subtracts)"
              onClick={() => setTool('wand')}
            >
              <span className={styles.toolIcon} style={{ '--icon': `url(${wandIcon})` } as React.CSSProperties} />
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
        </div>
        <div className={styles.canvasArea}>
          <div className={styles.canvasViewport} ref={canvasViewportRef}>
            <CanvasRulers width={width} height={height} cellSize={cellSize} enabled={showRulers}>
              <PixelCanvas
                ref={canvasRef}
                grid={grid}
                width={width}
                height={height}
                cellSize={cellSize}
                tool={tool}
                color={tool === 'gradient' && !constrained && gradientClear.start ? TRANSPARENT : paintColor}
                secondaryColor={secondaryColor}
                ditherPattern={ditherPattern}
                ditherSize={ditherSize}
                showGrid={showGrid}
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
                onCancelStroke={undo}
                onPaintCell={paintCell}
                onPaintCells={paintCells}
                selection={selection}
                onSelectionChange={setSelection}
              />
            </CanvasRulers>
          </div>
          {constrained && (
            <HardwarePanel
              title={mode.label}
              showTiles={showTiles}
              onShowTilesChange={setShowTiles}
              showRegions={showRegions}
              onShowRegionsChange={setShowRegions}
              strict={strict}
              onStrictChange={setStrict}
              uniqueTiles={uniqueTiles}
              maxUniqueTiles={mode.maxUniqueTiles}
            />
          )}
        </div>
        <div className={styles.colorPanel}>
          <div className={styles.colorArea}>
            {constrained && (
              <ConsolePalettePanel
                mode={mode}
                palette={modePalette}
                active={active}
                onSelect={setActive}
                secondarySlot={secondarySlot}
                onSelectSecondary={setSecondarySlot}
                onEditEntry={handleEditEntry}
              />
            )}
            {!constrained && palette.length > 0 && (
              <div className={styles.paletteGrid} aria-label="Colors used in this artwork">
                {palette.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className={styles.paletteSwatch}
                    style={{ backgroundColor: hex }}
                    aria-label={hex}
                    aria-pressed={hex.toLowerCase() === colorHex.toLowerCase()}
                    onClick={() => setColorHex(hex)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className={styles.colorRow}>
            <label
              className={styles.activeColor}
              style={paintHex && !gradientStartClear ? { backgroundColor: paintHex } : undefined}
              data-transparent={!paintHex || gradientStartClear}
              aria-label="Active color"
            >
              {!constrained && (
                <input
                  type="color"
                  value={colorHex}
                  onChange={(e) => {
                    setColorHex(e.target.value)
                    setGradientClear((clear) => ({ ...clear, start: false }))
                  }}
                  className={styles.hiddenColorInput}
                />
              )}
            </label>
            {tool === 'gradient' && (
              <label
                className={styles.activeColor}
                style={secondaryDisplayHex ? { backgroundColor: secondaryDisplayHex } : undefined}
                data-transparent={!secondaryDisplayHex}
                aria-label="Secondary color"
              >
                {!constrained && (
                  <input
                    type="color"
                    value={secondaryHex}
                    onChange={(e) => {
                      setSecondaryHex(e.target.value)
                      setGradientClear((clear) => ({ ...clear, end: false }))
                    }}
                    className={styles.hiddenColorInput}
                  />
                )}
              </label>
            )}
          </div>
          {tool === 'gradient' && !constrained && (
            <div className={styles.colorRow}>
              {(['start', 'end'] as const).map((end) => (
                <button
                  key={end}
                  type="button"
                  className={styles.clearToggle}
                  aria-pressed={gradientClear[end]}
                  title={`Make the gradient's ${end} transparent`}
                  onClick={() => setGradientClear((clear) => ({ ...clear, [end]: !clear[end] }))}
                >
                  Clear
                </button>
              ))}
            </div>
          )}
          {!constrained && (
            <Dropdown label="Recolor" variant="panel" align="right" fullWidth>
              <RecolorPanel
                grid={grid}
                palette={recolorPalette}
                selection={selection}
                onBeginStroke={beginStroke}
                onPaintCells={paintCells}
              />
            </Dropdown>
          )}
          {paletteTargets.length > 0 && (
            <Dropdown label="Send to" fullWidth disabled={palette.length === 0 && !backdrop}>
              {paletteTargets.map((target) => (
                <button key={target.path} type="button" onClick={() => sendPalette(target.send)}>
                  {target.label}
                </button>
              ))}
            </Dropdown>
          )}
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
            <PixelPreview grid={grid} width={width} height={height} zoom={previewShrunk ? previewFitScale : previewZoom} maxSize={MAX_PREVIEW} backdrop={backdrop} />
          </div>
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

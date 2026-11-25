import { useEffect, useMemo, useRef, useState } from 'react'
import { useMessageTargets } from '../../desktop/WindowManager'
import { Dropdown } from '../pixel-art/Dropdown'
import type { LiveParams } from './codegen'
import { generateSketch } from './codegen'
import { ScenePanel, SceneTools } from './ScenePanel'
import type { Scene } from './scene'
import { createDefaultScene } from './scene'
import { buildDocument } from './sketchDocument'
import { parseSketch, serializeSketch } from './sketchFile'
import { AppFrame } from '../AppFrame'
import styles from './P5SketchApp.module.css'

const MAX_LOG_LINES = 100
const STREAM_FPS = 30
/** How long a structural change (new shape, edited expression) waits before restarting the sketch, so typing doesn't restart it per key. */
const RESTART_DELAY_MS = 250

/** p5 is ~1MB, so it's only fetched once a sketch actually runs. */
let p5Source: Promise<string> | null = null
function loadP5(): Promise<string> {
  return (p5Source ??= import('p5/lib/p5.min.js?raw').then((module) => module.default))
}

interface LogLine {
  id: number
  level: 'log' | 'info' | 'warn' | 'error'
  text: string
}

interface Run {
  id: number
  html: string
}

type Source = 'scene' | 'code'
type Tab = 'gui' | 'code'

interface Drag {
  pickId: number
  /** Null until the sketch says which shape is under the pointer. */
  shapeId: number | null
  lastX: number
  lastY: number
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function P5SketchApp() {
  const [scene, setScene] = useState<Scene>(createDefaultScene)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  /** What drives the sketch: the GUI scene, or free-form code that took over from it. */
  const [source, setSource] = useState<Source>('scene')
  const [tab, setTab] = useState<Tab>('gui')
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('sketch')
  const [run, setRun] = useState<Run | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lineOffsetRef = useRef(0)
  const logIdRef = useRef(0)
  /** Mirrors the sketch's output so a stream can be captured from it; created on first use. */
  const streamCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamingRef = useRef(false)
  const frameTargets = useMessageTargets('frame-source')

  // Latest values for the message listener and timers, which outlive any one render.
  const sceneRef = useRef(scene)
  const sourceRef = useRef(source)
  const paramsRef = useRef<LiveParams | null>(null)
  /** The scene code the running sketch was started from; dial changes don't alter it, structural ones do. */
  const startedBodyRef = useRef<string | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const pickIdRef = useRef(0)

  const generated = useMemo(() => generateSketch(scene, true), [scene])
  const flatCode = useMemo(() => (tab === 'code' && source === 'scene' ? generateSketch(scene, false).body : ''), [scene, tab, source])

  const selectedIndex = scene.shapes.findIndex((shape) => shape.id === selectedId)
  const showGuides = source === 'scene' && tab === 'gui' && !streaming && selectedIndex >= 0
  const liveParams = useMemo<LiveParams>(
    () => ({ ...generated.params, guides: showGuides, sel: showGuides ? selectedIndex : -1 }),
    [generated.params, showGuides, selectedIndex],
  )

  useEffect(() => {
    sceneRef.current = scene
    sourceRef.current = source
    paramsRef.current = liveParams
  }, [scene, source, liveParams])

  /** Rebuilds the sketch page from `makeCode()` (called once p5 has loaded, so it sees the latest values). */
  async function start(makeCode: () => string) {
    try {
      const loaded = await loadP5()
      const { html, lineOffset } = buildDocument(loaded, makeCode())
      lineOffsetRef.current = lineOffset
      setSize(null)
      setLogs([])
      setRun((previous) => ({ id: (previous?.id ?? 0) + 1, html }))
    } catch {
      setMessage('Couldn’t load p5.')
    }
  }

  const startScene = () => {
    startedBodyRef.current = generated.body
    void start(() => `var P = ${JSON.stringify(paramsRef.current)}\n${generated.body}`)
  }

  function postParams() {
    iframeRef.current?.contentWindow?.postMessage({ type: 'params', params: paramsRef.current }, '*')
  }

  function postStreamState() {
    iframeRef.current?.contentWindow?.postMessage({ type: 'stream', on: streamingRef.current }, '*')
  }

  // Keeps a scene sketch in step with the GUI: dial changes are posted into the running sketch; anything that
  // changes the generated code (a new shape, a different wave, an edited expression) restarts it, after a pause.
  useEffect(() => {
    if (source !== 'scene') return
    if (run && startedBodyRef.current === generated.body) {
      postParams()
      return
    }
    const timer = setTimeout(
      () => {
        startedBodyRef.current = generated.body
        void start(() => `var P = ${JSON.stringify(paramsRef.current)}\n${generated.body}`)
      },
      run ? RESTART_DELAY_MS : 0,
    )
    return () => clearTimeout(timer)
    // `start` only reads refs and stable setters.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [source, generated.body, liveParams, run])

  useEffect(() => {
    function addLog(level: LogLine['level'], text: string) {
      // A sketch erroring every frame would otherwise bury everything else.
      setLogs((prev) => (prev.at(-1)?.text === text ? prev : [...prev.slice(-(MAX_LOG_LINES - 1)), { id: logIdRef.current++, level, text }]))
    }

    function onMessage(event: MessageEvent) {
      // Only the current sketch's frame is listened to; a replaced sketch's late messages are dropped.
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data
      switch (data?.type) {
        case 'ready':
          if (sourceRef.current === 'scene') postParams()
          postStreamState()
          break
        case 'size':
          setSize({ width: data.width, height: data.height })
          break
        case 'picked': {
          if (data.id !== pickIdRef.current) break
          const shape = data.shape >= 0 ? sceneRef.current.shapes[data.shape] : undefined
          setSelectedId(shape?.id ?? null)
          const drag = dragRef.current
          if (drag && drag.pickId === data.id) {
            if (shape) drag.shapeId = shape.id
            else dragRef.current = null
          }
          break
        }
        case 'frame': {
          const bitmap = data.bitmap as ImageBitmap
          const canvas = (streamCanvasRef.current ??= document.createElement('canvas'))
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
          bitmap.close()
          break
        }
        case 'error': {
          // Scene sketches report generated-code lines, which mean nothing to someone using the GUI.
          const line = sourceRef.current === 'code' && data.line > 0 ? data.line - lineOffsetRef.current : 0
          addLog('error', line > 0 ? `Line ${line}: ${data.message}` : String(data.message))
          break
        }
        case 'log':
          addLog(data.level, String(data.text))
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  function sendTo(target: (typeof frameTargets)[number]) {
    const canvas = (streamCanvasRef.current ??= document.createElement('canvas'))
    streamingRef.current = true
    setStreaming(true)
    const stream = canvas.captureStream(STREAM_FPS)
    target.send({ type: 'frame-source', stream, label: title.trim() || 'p5 sketch' })
    // After the stream exists, so the first mirrored frame is a change it captures.
    postStreamState()
  }

  function convertToCode() {
    const flat = generateSketch(scene, false).body
    setCode(flat)
    setSource('code')
    setTab('code')
    void start(() => flat)
  }

  function backToScene() {
    startedBodyRef.current = null
    setSource('scene')
    setTab('gui')
  }

  function restart() {
    if (source === 'scene') startScene()
    else void start(() => code)
  }

  function codeKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (source !== 'code') return
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void start(() => code)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const area = e.currentTarget
      area.setRangeText('  ', area.selectionStart, area.selectionEnd, 'end')
      setCode(area.value)
    }
  }

  async function loadSketch(file: File) {
    try {
      const sketch = parseSketch(await file.text())
      setTitle(sketch.title)
      setCode(sketch.code)
      setSelectedId(null)
      setMessage(null)
      if (sketch.scene) setScene(sketch.scene)
      setSource(sketch.source)
      setTab(sketch.source === 'scene' ? 'gui' : 'code')
      if (sketch.source === 'scene') startedBodyRef.current = null
      else void start(() => sketch.code)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read sketch.')
    }
  }

  function saveSketch() {
    const savedCode = source === 'scene' ? generateSketch(scene, false).body : code
    const file = serializeSketch({ title, source, code: savedCode, scene })
    download(new Blob([file], { type: 'application/json' }), `${title.trim() || 'sketch'}.p5sketch.json`)
  }

  // --- Canvas interaction (GUI mode): pick a shape and drag it. ---

  function pointOnCanvas(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) * scene.width) / rect.width, y: ((e.clientY - rect.top) * scene.height) / rect.height }
  }

  function onCanvasPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const { x, y } = pointOnCanvas(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    const pickId = ++pickIdRef.current
    dragRef.current = { pickId, shapeId: null, lastX: x, lastY: y }
    iframeRef.current?.contentWindow?.postMessage({ type: 'pick', x, y, id: pickId }, '*')
  }

  function onCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.shapeId === null) return
    const { x, y } = pointOnCanvas(e)
    const dx = x - drag.lastX
    const dy = y - drag.lastY
    drag.lastX = x
    drag.lastY = y
    // Moves the dial's own center, so an animated shape is dragged to a new middle rather than snapping back.
    // Expression dials have no number to nudge and stay put.
    const shift = (driver: Scene['shapes'][number]['props'][string], by: number) =>
      driver.kind === 'const' ? { ...driver, value: driver.value + by } : driver.kind === 'wave' ? { ...driver, center: driver.center + by } : driver
    setScene((prev) => ({
      ...prev,
      shapes: prev.shapes.map((shape) =>
        shape.id === drag.shapeId ? { ...shape, props: { ...shape.props, x: shift(shape.props.x, dx), y: shift(shape.props.y, dy) } } : shape,
      ),
    }))
  }

  const endDrag = () => {
    dragRef.current = null
  }

  const guiActive = source === 'scene' && tab === 'gui'
  const shown = source === 'scene' ? { width: scene.width, height: scene.height } : size

  const preview = (
    <div className={styles.preview}>
      <div
        className={styles.previewWrap}
        style={shown ? ({ '--w': `${shown.width}px`, '--h': `${shown.height}px` } as React.CSSProperties) : undefined}
      >
        {run && (
          <iframe
            key={run.id}
            ref={iframeRef}
            className={styles.frame}
            // Scripts only: no same-origin, so the sketch can't touch this page, its storage or its cookies.
            sandbox="allow-scripts"
            srcDoc={run.html}
            title="Sketch preview"
          />
        )}
        {guiActive && run && (
          <div
            className={styles.overlay}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
        )}
      </div>
    </div>
  )

  return (
    <AppFrame
      rightWidth="300px"
      top={
        <>
          <div className={styles.tabs} role="group" aria-label="Mode">
            <button type="button" aria-pressed={tab === 'gui'} onClick={() => setTab('gui')}>
              GUI
            </button>
            <button type="button" aria-pressed={tab === 'code'} onClick={() => setTab('code')}>
              Code
            </button>
          </div>
          {frameTargets.length > 0 && (
            <Dropdown label="Send to" disabled={!run}>
              {frameTargets.map((target) => (
                <button key={target.path} type="button" onClick={() => sendTo(target)}>
                  {target.label}
                </button>
              ))}
            </Dropdown>
          )}
          <input className={styles.titleInput} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Sketch name" />
          <button onClick={saveSketch}>Save</button>
          <label className="ui-button">
            Load
            <input
              type="file"
              accept="application/json,.json"
              className={styles.hiddenFileInput}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void loadSketch(file)
                e.target.value = ''
              }}
            />
          </label>
        </>
      }
      left={
        tab === 'gui' && source === 'scene' ? (
          <SceneTools scene={scene} onSelect={setSelectedId} onScene={(update) => setScene(update)} />
        ) : undefined
      }
      right={
        tab === 'code' ? undefined : source === 'scene' ? (
          <ScenePanel scene={scene} selectedId={selectedId} onSelect={setSelectedId} onScene={(update) => setScene(update)} />
        ) : (
          <div className={styles.panel}>
            <p className={styles.notice}>
              This sketch was converted to code, so the dials no longer drive it.
              <button type="button" onClick={backToScene}>
                Back to the scene
              </button>
            </p>
          </div>
        )
      }
      overlay={message && <div className={styles.messages}><p className={styles.message}>{message}</p></div>}
      bottom={
        <>
          <button onClick={restart}>Restart</button>
          {logs.length > 0 && (
            <pre className={styles.console}>
              {logs.map((line) => (
                <div key={line.id} data-level={line.level}>
                  {line.text}
                </div>
              ))}
            </pre>
          )}
        </>
      }
    >
      <div className={styles.stage} data-mode={tab}>
        {preview}
        {tab === 'code' && (
          <div className={styles.codeColumn}>
            <div className={styles.editorWrap}>
              <textarea
                className={styles.editor}
                value={source === 'scene' ? flatCode : code}
                readOnly={source === 'scene'}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={codeKeyDown}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="Sketch code"
              />
              {source === 'scene' ? (
                <button type="button" className={styles.editorAction} onClick={convertToCode}>
                  Convert to editable code
                </button>
              ) : (
                <button type="button" className={styles.editorAction} onClick={backToScene}>
                  Back to the scene
                </button>
              )}
            </div>
            {source === 'code' && <span className={styles.dialHint}>Edit freely and press Ctrl/Cmd+Enter to run.</span>}
          </div>
        )}
      </div>
    </AppFrame>
  )
}

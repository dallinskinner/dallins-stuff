import { useEffect, useRef, useState } from 'react'
import { useAppMessage } from '../../desktop/WindowManager'
import type { DitherParams, DitherRenderer } from './ditherRenderer'
import { ALGORITHM_GROUPS, ALGORITHMS, DEFAULT_RAMP, MATCHINGS, MAX_PALETTE_COLORS, createDitherRenderer } from './ditherRenderer'
import type { AnimatedImage } from './animatedImage'
import { decodeAnimatedImage } from './animatedImage'
import { parsePreset, serializePreset } from './presetFile'
import { AppFrame } from '../AppFrame'
import styles from './DitherApp.module.css'

/** Longest side of the output canvas; larger sources are scaled down to this. */
const MAX_OUTPUT_SIDE = 1280
const RECORD_FPS = 30
/** Hard cap on either side of the output, however far it's scaled up. */
const MAX_OUTPUT_PIXELS = 4096
const OUTPUT_SCALES = [1, 2, 3, 4, 6, 8]
const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2]

const PALETTES: { label: string; colors: string[] }[] = [
  { label: 'Black & white', colors: ['#000000', '#ffffff'] },
  { label: 'Game Boy', colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
  { label: 'CGA', colors: ['#000000', '#55ffff', '#ff55ff', '#ffffff'] },
  { label: 'Amber', colors: ['#000000', '#6b3a00', '#ffb000'] },
]

const DEFAULT_PARAMS: DitherParams = {
  mode: 'dither',
  ramp: DEFAULT_RAMP,
  cellSize: 8,
  letterSpacing: 1,
  lineHeight: 1,
  invert: false,
  algorithm: 'bayer4',
  matching: 'rgb',
  scale: 4,
  brightness: 0,
  contrast: 1,
  strength: 1,
  palette: PALETTES[0].colors,
}

interface Source {
  element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  kind: 'file-video' | 'image' | 'animation' | 'stream'
  label: string
  /** Set for animated images, whose `element` is the canvas this plays onto. */
  animation?: AnimatedImage
  /** Object URL to revoke when replaced. */
  url?: string
  /** Output pixels per source pixel, before the output scale. */
  fit: number
  /** Size of the source, in its own pixels. */
  width: number
  height: number
}

/** The output scale actually used: `wanted`, reduced if it would push either side past MAX_OUTPUT_PIXELS. */
function effectiveScale(source: Source, wanted: number): number {
  const longest = Math.max(source.width, source.height) * source.fit
  return Math.max(1, Math.min(wanted, Math.floor(MAX_OUTPUT_PIXELS / longest)))
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DitherApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<DitherRenderer | null>(null)
  const sourceRef = useRef<Source | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  /** Bumped by every load, so a slow async decode can't replace a source loaded after it. */
  const loadIdRef = useRef(0)

  const [params, setParams] = useState<DitherParams>(DEFAULT_PARAMS)
  const paramsRef = useRef(params)
  const [outputScale, setOutputScale] = useState(1)
  const outputScaleRef = useRef(outputScale)
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(speed)
  const [sourceLabel, setSourceLabel] = useState<string | null>(null)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number; fit: number } | null>(null)
  const [exportsOnce, setExportsOnce] = useState(false)
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(false)

  useEffect(() => {
    paramsRef.current = params
    outputScaleRef.current = outputScale
    speedRef.current = speed
  }, [params, outputScale, speed])

  // Renderer + draw loop. Open windows stay mounted, but the loop is a no-op until a source is loaded.
  useEffect(() => {
    const canvas = canvasRef.current!
    let renderer: DitherRenderer | null = null
    try {
      renderer = createDitherRenderer(canvas)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start WebGL.')
    }
    if (!renderer) {
      setUnsupported(true)
      return
    }
    rendererRef.current = renderer

    let raf = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const source = sourceRef.current
      if (!source) return
      const { element } = source
      // A live source can change size mid-stream (e.g. a sketch re-run with a new canvas), so follow it.
      if (source.kind === 'stream' && element instanceof HTMLVideoElement && element.videoWidth > 0) {
        if (element.videoWidth !== source.width || element.videoHeight !== source.height) {
          source.width = element.videoWidth
          source.height = element.videoHeight
          source.fit = Math.min(1, MAX_OUTPUT_SIDE / Math.max(source.width, source.height))
          setSourceSize({ width: source.width, height: source.height, fit: source.fit })
        }
      }
      // Live streams can't be slowed, so only files take the speed setting.
      if (source.animation) source.animation.speed = speedRef.current
      else if (source.kind === 'file-video' && element instanceof HTMLVideoElement && element.playbackRate !== speedRef.current) {
        element.playbackRate = speedRef.current
      }
      source.animation?.advance(now)
      if (element instanceof HTMLVideoElement && element.readyState < 2) return
      // Scaling up multiplies the canvas and the dither cells together, so the look stays the same, only bigger.
      const scale = effectiveScale(source, outputScaleRef.current)
      const width = Math.max(1, Math.round(source.width * source.fit * scale))
      const height = Math.max(1, Math.round(source.height * source.fit * scale))
      if (canvas.width !== width || canvas.height !== height) renderer.resize(width, height)
      renderer.draw(element, source.fit * scale, { ...paramsRef.current, scale: paramsRef.current.scale * scale, cellSize: paramsRef.current.cellSize * scale })
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      renderer.dispose()
      rendererRef.current = null
      if (sourceRef.current?.url) URL.revokeObjectURL(sourceRef.current.url)
      sourceRef.current?.animation?.dispose()
      sourceRef.current = null
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    }
  }, [])

  function applySource(element: Source['element'], width: number, height: number, kind: Source['kind'], label: string, url?: string, animation?: AnimatedImage) {
    const previous = sourceRef.current
    if (previous?.element instanceof HTMLVideoElement) {
      // Detach the handlers first: dropping the source below makes the old element fire an error, which would
      // otherwise show up as a message about a file that's already been replaced.
      previous.element.onerror = null
      previous.element.onloadedmetadata = null
      previous.element.pause()
      previous.element.srcObject = null
    }
    if (previous?.url) URL.revokeObjectURL(previous.url)
    previous?.animation?.dispose()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()

    const fit = Math.min(1, MAX_OUTPUT_SIDE / Math.max(width, height))
    sourceRef.current = { element, kind, label, url, fit, width, height, animation }
    setSourceSize({ width, height, fit })
    setSourceLabel(label)
    setExportsOnce(kind === 'file-video' || kind === 'animation')
    setMessage(null)
  }

  function loadVideo(video: HTMLVideoElement, kind: Source['kind'], label: string, url?: string) {
    const loadId = loadIdRef.current
    video.muted = true
    video.loop = kind === 'file-video'
    video.playsInline = true
    video.onloadedmetadata = () => {
      applySource(video, video.videoWidth, video.videoHeight, kind, label, url)
      void video.play()
    }
    // Ignore errors from a load that a newer file or source has since replaced.
    video.onerror = () => {
      if (loadId === loadIdRef.current) setMessage(`Couldn't play ${label}.`)
    }
  }

  function loadFile(file: File) {
    const loadId = ++loadIdRef.current
    const url = URL.createObjectURL(file)
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      loadVideo(video, 'file-video', file.name, url)
      video.src = url
    } else if (file.type === 'image/gif' || file.type === 'image/webp') {
      void loadMaybeAnimated(file, url, loadId)
    } else if (file.type.startsWith('image/')) {
      const image = new Image()
      image.onload = () => applySource(image, image.naturalWidth, image.naturalHeight, 'image', file.name, url)
      image.onerror = () => {
        URL.revokeObjectURL(url)
        setMessage(`Couldn't read ${file.name}.`)
      }
      image.src = url
    } else {
      URL.revokeObjectURL(url)
      setMessage('Choose a video or image file.')
    }
  }

  /** GIF/WebP: plays as an animation when it has several frames, otherwise (or if the browser can't decode them) loads as a still. */
  async function loadMaybeAnimated(file: File, url: string, loadId: number) {
    let animation: AnimatedImage | null = null
    try {
      animation = await decodeAnimatedImage(file)
    } catch {
      setMessage(`Couldn't decode ${file.name}.`)
    }
    if (loadId !== loadIdRef.current) {
      animation?.dispose()
      URL.revokeObjectURL(url)
      return
    }
    if (animation) {
      applySource(animation.canvas, animation.canvas.width, animation.canvas.height, 'animation', file.name, url, animation)
      return
    }
    const image = new Image()
    image.onload = () => {
      if (loadId !== loadIdRef.current) return URL.revokeObjectURL(url)
      applySource(image, image.naturalWidth, image.naturalHeight, 'image', file.name, url)
      if (typeof ImageDecoder === 'undefined') setMessage('This browser can\u2019t play animated images, so only the first frame is shown.')
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      setMessage(`Couldn't read ${file.name}.`)
    }
    image.src = url
  }

  useAppMessage('frame-source', ({ stream, label }) => {
    loadIdRef.current++
    const video = document.createElement('video')
    loadVideo(video, 'stream', label ?? 'Live source')
    video.srcObject = stream
  })

  useAppMessage('palette', ({ colors }) => {
    const palette = colors.slice(0, MAX_PALETTE_COLORS).map(({ hex }) => hex.toLowerCase())
    if (palette.length > 0) setParams((prev) => ({ ...prev, palette }))
  })

  const patch = (change: Partial<DitherParams>) => setParams((prev) => ({ ...prev, ...change }))
  const setColor = (index: number, hex: string) =>
    patch({ palette: params.palette.map((color, i) => (i === index ? hex : color)) })

  function startRecording() {
    const canvas = canvasRef.current
    const source = sourceRef.current
    if (!canvas || !source || typeof MediaRecorder === 'undefined') {
      setMessage('Recording isn’t supported in this browser.')
      return
    }
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type))
    const recorder = new MediaRecorder(canvas.captureStream(RECORD_FPS), { mimeType, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      setRecording(false)
      recorderRef.current = null
      if (source.animation) source.animation.onLoop = null
      if (source.element instanceof HTMLVideoElement && source.kind === 'file-video') {
        source.element.onended = null
        source.element.loop = true
        void source.element.play()
      }
      if (chunks.length > 0) download(new Blob(chunks, { type: 'video/webm' }), 'dithered.webm')
    }

    // A video file or animated image is recorded for exactly one pass; live sources and stills record until stopped.
    if (source.animation) {
      source.animation.restart()
      source.animation.onLoop = () => recorder.state === 'recording' && recorder.stop()
    }
    if (source.element instanceof HTMLVideoElement && source.kind === 'file-video') {
      source.element.loop = false
      source.element.currentTime = 0
      source.element.onended = () => recorder.state === 'recording' && recorder.stop()
      void source.element.play()
    }
    recorder.start()
    recorderRef.current = recorder
    setRecording(true)
  }

  const stopRecording = () => recorderRef.current?.stop()

  async function loadPreset(file: File) {
    try {
      setParams(parsePreset(await file.text()))
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read preset.')
    }
  }

  return (
    <AppFrame
      className={styles.app}
      rightWidth="240px"
      top={
        <>
          <label className="ui-button">
            Open video or image
            <input
              type="file"
              accept="video/*,image/*"
              className={styles.hiddenFileInput}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) loadFile(file)
                e.target.value = ''
              }}
            />
          </label>
          {recording ? (
            <button onClick={stopRecording}>Stop &amp; save</button>
          ) : (
            <button onClick={startRecording} disabled={!sourceLabel}>
              {exportsOnce ? 'Export WebM' : 'Record WebM'}
            </button>
          )}
          {sourceLabel && <span className={styles.sourceLabel}>{sourceLabel}</span>}
        </>
      }
      right={
        <>
          <div className={`ui-fields ${styles.controls}`}>
            <label className="ui-field">
              <span className="ui-field-header">Mode</span>
              <select value={params.mode} onChange={(e) => patch({ mode: e.target.value as DitherParams['mode'] })}>
                <option value="dither">Dither</option>
                <option value="ascii">ASCII</option>
              </select>
            </label>
            {params.mode === 'dither' && (
            <label className="ui-field">
              <span className="ui-field-header">Algorithm</span>
              <select value={params.algorithm} onChange={(e) => patch({ algorithm: e.target.value as DitherParams['algorithm'] })}>
                {ALGORITHM_GROUPS.map((group) => (
                  <optgroup key={group} label={group}>
                    {ALGORITHMS.filter((algorithm) => algorithm.group === group).map(({ id, label }) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            )}
            <label className="ui-field">
              <span className="ui-field-header">Color matching</span>
              <select
                value={params.matching}
                title={MATCHINGS.find((m) => m.id === params.matching)?.hint}
                onChange={(e) => patch({ matching: e.target.value as DitherParams['matching'] })}
              >
                {MATCHINGS.map(({ id, label, hint }) => (
                  <option key={id} value={id} title={hint}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {exportsOnce && (
              <label className="ui-field">
                <span className="ui-field-header">Playback speed</span>
                <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  {SPEEDS.map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="ui-field">
              <span className="ui-field-header">Output scale</span>
              <select value={outputScale} disabled={recording} onChange={(e) => setOutputScale(Number(e.target.value))}>
                {OUTPUT_SCALES.filter((n) => {
                  if (!sourceSize) return n === 1
                  return n === 1 || Math.max(sourceSize.width, sourceSize.height) * sourceSize.fit * n <= MAX_OUTPUT_PIXELS
                }).map((n) => (
                  <option key={n} value={n}>
                    {sourceSize ? `${n}× (${Math.round(sourceSize.width * sourceSize.fit * n)}×${Math.round(sourceSize.height * sourceSize.fit * n)})` : `${n}×`}
                  </option>
                ))}
              </select>
            </label>
            {params.mode === 'ascii' ? (
              <>
                <Slider label="Cell width" value={params.cellSize} min={3} max={32} step={1} onChange={(cellSize) => patch({ cellSize })} />
                <Slider label="Letter spacing" value={params.letterSpacing} min={0.5} max={1.5} step={0.01} onChange={(letterSpacing) => patch({ letterSpacing })} />
                <Slider label="Line height" value={params.lineHeight} min={0.5} max={1.5} step={0.01} onChange={(lineHeight) => patch({ lineHeight })} />
                <label className="ui-field">
                  <span className="ui-field-header">Ramp (dark &rarr; light)</span>
                  <textarea value={params.ramp} onChange={(e) => patch({ ramp: e.target.value })} spellCheck={false} />
                </label>
                <label className="ui-check">
                  <input type="checkbox" checked={params.invert} onChange={(e) => patch({ invert: e.target.checked })} />
                  Invert
                </label>
              </>
            ) : (
              <Slider label="Pixel size" value={params.scale} min={1} max={16} step={1} onChange={(scale) => patch({ scale })} />
            )}
            <Slider label="Brightness" value={params.brightness} min={-0.5} max={0.5} step={0.01} onChange={(brightness) => patch({ brightness })} />
            <Slider label="Contrast" value={params.contrast} min={0.25} max={3} step={0.01} onChange={(contrast) => patch({ contrast })} />
            {params.mode === 'dither' && (
              <Slider label="Dither strength" value={params.strength} min={0} max={1.5} step={0.01} onChange={(strength) => patch({ strength })} />
            )}
            <div className={styles.actions}>
              <button
                onClick={() =>
                  patch({ brightness: DEFAULT_PARAMS.brightness, contrast: DEFAULT_PARAMS.contrast, strength: DEFAULT_PARAMS.strength })
                }
                disabled={
                  params.brightness === DEFAULT_PARAMS.brightness &&
                  params.contrast === DEFAULT_PARAMS.contrast &&
                  params.strength === DEFAULT_PARAMS.strength
                }
              >
                Reset adjustments
              </button>
            </div>

            <div className="ui-field">
              <span className="ui-field-header">Palette</span>
              <select
                value=""
                onChange={(e) => {
                  const preset = PALETTES[Number(e.target.value)]
                  if (preset) patch({ palette: preset.colors })
                }}
              >
                <option value="" disabled>
                  Load a preset&hellip;
                </option>
                {PALETTES.map(({ label }, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </select>
              <div className={styles.swatches}>
                {params.palette.map((hex, i) => (
                  <div key={i} className="ui-swatch">
                    <input type="color" value={hex} onChange={(e) => setColor(i, e.target.value)} aria-label={`Palette color ${i + 1}`} />
                    <button
                      className="ui-swatch-remove"
                      onClick={() => patch({ palette: params.palette.filter((_, j) => j !== i) })}
                      disabled={params.palette.length <= 1}
                      aria-label={`Remove color ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => patch({ palette: [...params.palette, '#808080'] })}
                  disabled={params.palette.length >= MAX_PALETTE_COLORS}
                >
                  Add color
                </button>
              </div>
            </div>

            <div className={styles.actions}>
              <button onClick={() => download(new Blob([serializePreset(params)], { type: 'application/json' }), 'dither.ditherpreset.json')}>
                Save preset
              </button>
              <label className="ui-button">
                Load preset
                <input
                  type="file"
                  accept="application/json,.json"
                  className={styles.hiddenFileInput}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void loadPreset(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </div>
        </>
      }
      overlay={
        (message || unsupported) && (
          <div className={styles.messages}>
            {message && <p className={styles.message}>{message}</p>}
            {unsupported && <p className={styles.message}>WebGL 2 isn&rsquo;t available, so the dither tool can&rsquo;t run here.</p>}
          </div>
        )
      }
    >
      <canvas ref={canvasRef} className={styles.canvas} hidden={!sourceLabel} />
      {!sourceLabel && <p className={styles.empty}>Open a video or image, or send a sketch or noise here from the p5 or Noise tool.</p>}
    </AppFrame>
  )
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="ui-field">
      <span className="ui-field-header">
        {label}
        <output>{Number.isInteger(step) ? value : value.toFixed(2)}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

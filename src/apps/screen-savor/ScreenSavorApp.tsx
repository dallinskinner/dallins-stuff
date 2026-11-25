import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { makeNoise2D, makeNoise3D } from 'fast-simplex-noise'
import { AppFrame } from '../AppFrame'
import styles from './ScreenSavorApp.module.css'

type AnimationMode = 'fade' | 'depth'

const DEFAULT_RAMP = '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,"^`\' '

const WIDTH_MIN = 20
const WIDTH_MAX = 160
const HEIGHT_MIN = 10
const HEIGHT_MAX = 80
const CELL_MIN = 4
const CELL_MAX = 96
const SCALE_MIN = 0.001
const SCALE_MAX = 0.2
const FADE_MIN = -1
const FADE_MAX = 1
const DEPTH_SPEED_MIN = 0.0005
const DEPTH_SPEED_MAX = 0.05
const FRAMES_MIN = 2
const FRAMES_MAX = 240
const FONT_WEIGHT_MIN = 400
const FONT_WEIGHT_MAX = 700
const LINE_HEIGHT_MIN = 0.8
const LINE_HEIGHT_MAX = 2
const LETTER_SPACING_MIN = -0.05
const LETTER_SPACING_MAX = 0.5
const PLAYBACK_FPS = 24
const FRAME_DURATION_MS = 1000 / PLAYBACK_FPS
const SPEED_MIN = 0.1
const SPEED_MAX = 3

function hashSeed(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomSeed(): string {
  return Math.floor(Math.random() * 1e9).toString()
}

function buildArt(gridWidth: number, gridHeight: number, ramp: string, sample: (x: number, y: number) => number) {
  const chars = ramp.length > 0 ? ramp : DEFAULT_RAMP
  const rows: string[] = []
  for (let y = 0; y < gridHeight; y++) {
    let row = ''
    for (let x = 0; x < gridWidth; x++) {
      const normalized = Math.min(1, Math.max(0, sample(x, y)))
      const index = Math.min(chars.length - 1, Math.floor(normalized * chars.length))
      row += chars[index]
    }
    rows.push(row)
  }
  return rows.join('\n')
}

// Fade mode: a static noise field whose overall level fades between
// startFade and endFade across the animation. Depth mode: the noise field
// itself morphs, sampling through a 3rd (time) axis per frame.
function computeSampler(
  mode: AnimationMode,
  frame: number,
  totalFrames: number,
  scale: number,
  startFade: number,
  endFade: number,
  depthSpeed: number,
  noise2D: (x: number, y: number) => number,
  noise3D: (x: number, y: number, z: number) => number,
): (x: number, y: number) => number {
  if (mode === 'depth') {
    const depth = frame * depthSpeed
    return (x, y) => (noise3D(x * scale, y * scale, depth) + 1) / 2
  }
  const progress = totalFrames > 1 ? frame / (totalFrames - 1) : 0
  const fade = startFade + (endFade - startFade) * progress
  return (x, y) => (noise2D(x * scale, y * scale) + 1) / 2 + fade
}

export function ScreenSavorApp() {
  const [gridWidth, setGridWidth] = useState(70)
  const [gridHeight, setGridHeight] = useState(35)
  const [cellSize, setCellSize] = useState(8)
  const [fontWeight, setFontWeight] = useState(400)
  const [lineHeight, setLineHeight] = useState(1)
  const [letterSpacing, setLetterSpacing] = useState(0)
  const [scale, setScale] = useState(0.08)
  const [seed, setSeed] = useState(randomSeed)
  const [ramp, setRamp] = useState(DEFAULT_RAMP)
  const [animationMode, setAnimationMode] = useState<AnimationMode>('fade')
  const [startFade, setStartFade] = useState(0)
  const [endFade, setEndFade] = useState(0)
  const [depthSpeed, setDepthSpeed] = useState(0.01)
  const [totalFrames, setTotalFrames] = useState(60)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [shuffleOnLoop, setShuffleOnLoop] = useState(false)

  const noise2D = useMemo(() => makeNoise2D(mulberry32(hashSeed(seed))), [seed])
  const noise3D = useMemo(() => makeNoise3D(mulberry32(hashSeed(seed))), [seed])

  const preRef = useRef<HTMLPreElement>(null)
  const scrubberRef = useRef<HTMLInputElement>(null)
  const frameCountRef = useRef<HTMLSpanElement>(null)

  // While playing, the animation loop below drives these directly and never
  // touches React state, so a 24fps loop doesn't force a React re-render
  // (and therefore a full reconciliation pass) on every frame. These refs
  // always hold the latest value so the loop doesn't need to restart when a
  // control changes mid-playback.
  const frameRef = useRef(currentFrame)
  const gridWidthRef = useRef(gridWidth)
  gridWidthRef.current = gridWidth
  const gridHeightRef = useRef(gridHeight)
  gridHeightRef.current = gridHeight
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const rampRef = useRef(ramp)
  rampRef.current = ramp
  const animationModeRef = useRef(animationMode)
  animationModeRef.current = animationMode
  const startFadeRef = useRef(startFade)
  startFadeRef.current = startFade
  const endFadeRef = useRef(endFade)
  endFadeRef.current = endFade
  const depthSpeedRef = useRef(depthSpeed)
  depthSpeedRef.current = depthSpeed
  const totalFramesRef = useRef(totalFrames)
  totalFramesRef.current = totalFrames
  const noise2DRef = useRef(noise2D)
  noise2DRef.current = noise2D
  const noise3DRef = useRef(noise3D)
  noise3DRef.current = noise3D
  const shuffleOnLoopRef = useRef(shuffleOnLoop)
  shuffleOnLoopRef.current = shuffleOnLoop
  const playbackSpeedRef = useRef(playbackSpeed)
  playbackSpeedRef.current = playbackSpeed

  useEffect(() => {
    setCurrentFrame((frame) => Math.min(frame, totalFrames - 1))
  }, [totalFrames])

  // Keep the ref in sync with React state whenever the state is the source
  // of truth (i.e. we're not mid-animation).
  useEffect(() => {
    if (!isPlaying) frameRef.current = currentFrame
  }, [currentFrame, isPlaying])

  useEffect(() => {
    if (scrubberRef.current) scrubberRef.current.value = String(currentFrame)
  }, [currentFrame])

  useLayoutEffect(() => {
    if (!isPlaying) return

    // The JSX below stops rendering `art`/the frame count as soon as
    // isPlaying flips true, so without this the pre would briefly go blank
    // (and the window would shrink) before the first tick below fires.
    // Priming synchronously, before paint, keeps the current frame on
    // screen without a gap.
    const total = totalFramesRef.current
    const primeSample = computeSampler(
      animationModeRef.current,
      frameRef.current,
      total,
      scaleRef.current,
      startFadeRef.current,
      endFadeRef.current,
      depthSpeedRef.current,
      noise2DRef.current,
      noise3DRef.current,
    )
    const currentArt = buildArt(gridWidthRef.current, gridHeightRef.current, rampRef.current, primeSample)
    if (preRef.current) preRef.current.textContent = currentArt
    if (frameCountRef.current) frameCountRef.current.textContent = `${frameRef.current + 1} / ${total}`

    let rafId: number
    let last = performance.now()

    function tick(now: number) {
      rafId = requestAnimationFrame(tick)
      const elapsed = now - last
      const frameDuration = FRAME_DURATION_MS / playbackSpeedRef.current
      if (elapsed < frameDuration) return
      last = now - (elapsed % frameDuration)

      const total = totalFramesRef.current
      frameRef.current = (frameRef.current + 1) % total

      if (frameRef.current === 0 && shuffleOnLoopRef.current) {
        const nextSeed = randomSeed()
        setSeed(nextSeed)
        // Update the refs immediately so this frame uses the new seed too,
        // instead of waiting a tick for the React state update to land.
        noise2DRef.current = makeNoise2D(mulberry32(hashSeed(nextSeed)))
        noise3DRef.current = makeNoise3D(mulberry32(hashSeed(nextSeed)))
      }

      const tickSample = computeSampler(
        animationModeRef.current,
        frameRef.current,
        total,
        scaleRef.current,
        startFadeRef.current,
        endFadeRef.current,
        depthSpeedRef.current,
        noise2DRef.current,
        noise3DRef.current,
      )
      const nextArt = buildArt(gridWidthRef.current, gridHeightRef.current, rampRef.current, tickSample)

      if (preRef.current) preRef.current.textContent = nextArt
      if (scrubberRef.current) scrubberRef.current.value = String(frameRef.current)
      if (frameCountRef.current) frameCountRef.current.textContent = `${frameRef.current + 1} / ${total}`
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying])

  const art = useMemo(() => {
    const sample = computeSampler(
      animationMode,
      currentFrame,
      totalFrames,
      scale,
      startFade,
      endFade,
      depthSpeed,
      noise2D,
      noise3D,
    )
    return buildArt(gridWidth, gridHeight, ramp, sample)
  }, [
    gridWidth,
    gridHeight,
    ramp,
    animationMode,
    currentFrame,
    totalFrames,
    scale,
    startFade,
    endFade,
    depthSpeed,
    noise2D,
    noise3D,
  ])

  function pause() {
    setCurrentFrame(frameRef.current)
    setIsPlaying(false)
  }

  return (
    <AppFrame
      rightWidth="160px"
      top={
        <button type="button" data-size="sm" onClick={() => navigator.clipboard.writeText(preRef.current?.textContent ?? art)}>
          Copy
        </button>
      }
      right={
        <div className={`ui-fields ${styles.controls}`}>
          <details open>
            <summary>Canvas</summary>
            <div className="ui-details-body">
              <label className="ui-field">
                <span className="ui-field-header">
                  Width
                  <output>{gridWidth}</output>
                </span>
                <input
                  type="range"
                  min={WIDTH_MIN}
                  max={WIDTH_MAX}
                  step={5}
                  value={gridWidth}
                  onChange={(e) => setGridWidth(Number(e.target.value))}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Height
                  <output>{gridHeight}</output>
                </span>
                <input
                  type="range"
                  min={HEIGHT_MIN}
                  max={HEIGHT_MAX}
                  step={5}
                  value={gridHeight}
                  onChange={(e) => setGridHeight(Number(e.target.value))}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Noise scale
                  <output>{scale.toFixed(3)}</output>
                </span>
                <input
                  type="range"
                  min={SCALE_MIN}
                  max={SCALE_MAX}
                  step={0.001}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                />
              </label>
            </div>
          </details>

          <details>
            <summary>Font</summary>
            <div className="ui-details-body">
              <label className="ui-field">
                <span className="ui-field-header">
                  Cell size
                  <output>{cellSize}px</output>
                </span>
                <input
                  type="range"
                  min={CELL_MIN}
                  max={CELL_MAX}
                  step={1}
                  value={cellSize}
                  onChange={(e) => setCellSize(Number(e.target.value))}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Font weight
                  <output>{fontWeight}</output>
                </span>
                <input
                  type="range"
                  min={FONT_WEIGHT_MIN}
                  max={FONT_WEIGHT_MAX}
                  step={10}
                  value={fontWeight}
                  onChange={(e) => setFontWeight(Number(e.target.value))}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Line height
                  <output>{lineHeight.toFixed(2)}</output>
                </span>
                <input
                  type="range"
                  min={LINE_HEIGHT_MIN}
                  max={LINE_HEIGHT_MAX}
                  step={0.05}
                  value={lineHeight}
                  onChange={(e) => setLineHeight(Number(e.target.value))}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Letter spacing
                  <output>{letterSpacing.toFixed(2)}em</output>
                </span>
                <input
                  type="range"
                  min={LETTER_SPACING_MIN}
                  max={LETTER_SPACING_MAX}
                  step={0.01}
                  value={letterSpacing}
                  onChange={(e) => setLetterSpacing(Number(e.target.value))}
                />
              </label>
            </div>
          </details>

          <details>
            <summary>Ramp</summary>
            <div className="ui-details-body">
              <label className="ui-field">
                <span className="ui-field-header">Ramp (dark → light)</span>
                <textarea
                  className={styles.rampInput}
                  value={ramp}
                  onChange={(e) => setRamp(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">Animation mode</span>
                <select
                  value={animationMode}
                  onChange={(e) => setAnimationMode(e.target.value as AnimationMode)}
                >
                  <option value="fade">Fade</option>
                  <option value="depth">3D noise</option>
                </select>
              </label>
              {animationMode === 'fade' ? (
                <>
                  <label className="ui-field">
                    <span className="ui-field-header">
                      Fade from
                      <output>{`${startFade > 0 ? '+' : ''}${startFade.toFixed(2)}`}</output>
                    </span>
                    <input
                      type="range"
                      min={FADE_MIN}
                      max={FADE_MAX}
                      step={0.01}
                      value={startFade}
                      onChange={(e) => setStartFade(Number(e.target.value))}
                    />
                  </label>
                  <label className="ui-field">
                    <span className="ui-field-header">
                      Fade to
                      <output>{`${endFade > 0 ? '+' : ''}${endFade.toFixed(2)}`}</output>
                    </span>
                    <input
                      type="range"
                      min={FADE_MIN}
                      max={FADE_MAX}
                      step={0.01}
                      value={endFade}
                      onChange={(e) => setEndFade(Number(e.target.value))}
                    />
                  </label>
                </>
              ) : (
                <label className="ui-field">
                  <span className="ui-field-header">
                    Depth speed
                    <output>{depthSpeed.toFixed(4)}</output>
                  </span>
                  <input
                    type="range"
                    min={DEPTH_SPEED_MIN}
                    max={DEPTH_SPEED_MAX}
                    step={0.0005}
                    value={depthSpeed}
                    onChange={(e) => setDepthSpeed(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
          </details>

          <details open>
            <summary>Seed</summary>
            <div className="ui-details-body">
              <label className="ui-field">
                <span className="ui-field-header">Seed</span>
                <input
                  type="text"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label className="ui-check">
                <input
                  type="checkbox"
                  checked={shuffleOnLoop}
                  onChange={(e) => setShuffleOnLoop(e.target.checked)}
                />
                Shuffle seed on loop
              </label>
              <button type="button" onClick={() => setSeed(randomSeed())}>
                Regenerate
              </button>
            </div>
          </details>

          <details open>
            <summary>Playback</summary>
            <div className="ui-details-body">
              <label className="ui-field">
                <span className="ui-field-header">
                  Frames
                  <output>{totalFrames}</output>
                </span>
                <input
                  type="range"
                  min={FRAMES_MIN}
                  max={FRAMES_MAX}
                  step={1}
                  value={totalFrames}
                  onChange={(e) => setTotalFrames(Number(e.target.value))}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Speed
                  <output>{playbackSpeed.toFixed(1)}x</output>
                </span>
                <input
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={0.1}
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                />
              </label>
            </div>
          </details>
        </div>
      }
      bottom={
        <>
          <button type="button" onClick={() => (isPlaying ? pause() : setIsPlaying(true))}>
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <input
            ref={scrubberRef}
            type="range"
            className={styles.scrubber}
            min={0}
            max={totalFrames - 1}
            step={1}
            defaultValue={currentFrame}
            onPointerDown={() => isPlaying && pause()}
            onChange={(e) => setCurrentFrame(Number(e.currentTarget.value))}
          />
          <span ref={frameCountRef} className={styles.frameCount}>
            {isPlaying ? null : `${currentFrame + 1} / ${totalFrames}`}
          </span>
        </>
      }
    >
      <pre
        ref={preRef}
        className={styles.render}
        style={{
          fontSize: `${cellSize}px`,
          fontWeight,
          lineHeight,
          letterSpacing: `${letterSpacing}em`,
        }}
      >
        {isPlaying ? null : art}
      </pre>
    </AppFrame>
  )
}

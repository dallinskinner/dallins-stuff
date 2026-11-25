import { useEffect, useMemo, useRef, useState } from 'react'
import { makeNoise2D, makeNoise3D } from 'fast-simplex-noise'
import { useMessageTargets } from '../../desktop/WindowManager'
import { AppFrame } from '../AppFrame'
import { Dropdown } from '../pixel-art/Dropdown'
import styles from './NoiseApp.module.css'

type AnimationMode = 'fade' | 'depth'

const WIDTH_MIN = 16
const WIDTH_MAX = 960
const HEIGHT_MIN = 16
const HEIGHT_MAX = 540
const SCALE_MIN = 0.0001
const SCALE_MAX = 0.02
const FADE_MIN = -1
const FADE_MAX = 1
const DEPTH_SPEED_MIN = 0.0005
const DEPTH_SPEED_MAX = 0.05
const FRAMES_MIN = 2
const FRAMES_MAX = 240
const PLAYBACK_FPS = 24
const FRAME_DURATION_MS = 1000 / PLAYBACK_FPS
const SPEED_MIN = 0.1
const SPEED_MAX = 3
const STREAM_FPS = 30

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

interface NoiseParams {
  width: number
  height: number
  scale: number
  mode: AnimationMode
  startFade: number
  endFade: number
  depthSpeed: number
  totalFrames: number
  noise2D: (x: number, y: number) => number
  noise3D: (x: number, y: number, z: number) => number
}

/** Paints one grayscale frame of the noise. Fade mode: a static field whose level fades between startFade and
 *  endFade across the animation. Depth mode: the field morphs, sampling through a 3rd (time) axis. */
function drawFrame(canvas: HTMLCanvasElement, frame: number, p: NoiseParams) {
  if (canvas.width !== p.width) canvas.width = p.width
  if (canvas.height !== p.height) canvas.height = p.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const image = ctx.createImageData(p.width, p.height)
  const data = image.data
  const depth = frame * p.depthSpeed
  const progress = p.totalFrames > 1 ? frame / (p.totalFrames - 1) : 0
  const fade = p.startFade + (p.endFade - p.startFade) * progress
  let i = 0
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const raw = p.mode === 'depth' ? (p.noise3D(x * p.scale, y * p.scale, depth) + 1) / 2 : (p.noise2D(x * p.scale, y * p.scale) + 1) / 2 + fade
      const v = Math.round(Math.min(1, Math.max(0, raw)) * 255)
      data[i++] = v
      data[i++] = v
      data[i++] = v
      data[i++] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function NoiseApp() {
  const [width, setWidth] = useState(320)
  const [height, setHeight] = useState(180)
  const [scale, setScale] = useState(0.002)
  const [seed, setSeed] = useState(randomSeed)
  const [animationMode, setAnimationMode] = useState<AnimationMode>('depth')
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

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrubberRef = useRef<HTMLInputElement>(null)
  const frameCountRef = useRef<HTMLSpanElement>(null)
  const frameTargets = useMessageTargets('frame-source')

  // While playing, the loop below drives the canvas directly and never touches React state, so a 24fps
  // loop doesn't re-render the app each frame. These refs hold the latest values so the loop needn't restart.
  const frameRef = useRef(currentFrame)
  const paramsRef = useRef<NoiseParams>(null!)
  paramsRef.current = { width, height, scale, mode: animationMode, startFade, endFade, depthSpeed, totalFrames, noise2D, noise3D }
  const shuffleOnLoopRef = useRef(shuffleOnLoop)
  shuffleOnLoopRef.current = shuffleOnLoop
  const playbackSpeedRef = useRef(playbackSpeed)
  playbackSpeedRef.current = playbackSpeed

  useEffect(() => {
    setCurrentFrame((frame) => Math.min(frame, totalFrames - 1))
  }, [totalFrames])

  // Paused (or any dial changed): the state is the source of truth, so repaint from it. A repaint also
  // gives a paused stream a new frame to capture.
  useEffect(() => {
    if (isPlaying) return
    frameRef.current = currentFrame
    if (canvasRef.current) drawFrame(canvasRef.current, currentFrame, paramsRef.current)
    if (scrubberRef.current) scrubberRef.current.value = String(currentFrame)
  }, [isPlaying, currentFrame, width, height, scale, animationMode, startFade, endFade, depthSpeed, totalFrames, noise2D, noise3D])

  useEffect(() => {
    if (!isPlaying) return
    let rafId: number
    let last = performance.now()

    function tick(now: number) {
      rafId = requestAnimationFrame(tick)
      const elapsed = now - last
      const frameDuration = FRAME_DURATION_MS / playbackSpeedRef.current
      if (elapsed < frameDuration) return
      last = now - (elapsed % frameDuration)

      const total = paramsRef.current.totalFrames
      frameRef.current = (frameRef.current + 1) % total

      if (frameRef.current === 0 && shuffleOnLoopRef.current) {
        const nextSeed = randomSeed()
        setSeed(nextSeed)
        // Apply immediately so this frame uses the new seed too, instead of waiting for the state update.
        paramsRef.current = {
          ...paramsRef.current,
          noise2D: makeNoise2D(mulberry32(hashSeed(nextSeed))),
          noise3D: makeNoise3D(mulberry32(hashSeed(nextSeed))),
        }
      }

      if (canvasRef.current) drawFrame(canvasRef.current, frameRef.current, paramsRef.current)
      if (scrubberRef.current) scrubberRef.current.value = String(frameRef.current)
      if (frameCountRef.current) frameCountRef.current.textContent = `${frameRef.current + 1} / ${total}`
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying])

  function pause() {
    setCurrentFrame(frameRef.current)
    setIsPlaying(false)
  }

  function sendTo(target: (typeof frameTargets)[number]) {
    const canvas = canvasRef.current
    if (!canvas) return
    target.send({ type: 'frame-source', stream: canvas.captureStream(STREAM_FPS), label: 'Noise' })
  }

  return (
    <AppFrame
      rightWidth="200px"
      top={
        frameTargets.length > 0 && (
          <Dropdown label="Send to">
            {frameTargets.map((target) => (
              <button key={target.path} type="button" onClick={() => sendTo(target)}>
                {target.label}
              </button>
            ))}
          </Dropdown>
        )
      }
      right={
        <div className={`ui-fields ${styles.controls}`}>
          <details open>
            <summary>Canvas</summary>
            <div className="ui-details-body">
              <label className="ui-field">
                <span className="ui-field-header">
                  Width
                  <output>{width}</output>
                </span>
                <input type="range" min={WIDTH_MIN} max={WIDTH_MAX} step={16} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Height
                  <output>{height}</output>
                </span>
                <input type="range" min={HEIGHT_MIN} max={HEIGHT_MAX} step={16} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Noise scale
                  <output>{scale.toFixed(4)}</output>
                </span>
                <input type="range" min={SCALE_MIN} max={SCALE_MAX} step={0.0001} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
              </label>
            </div>
          </details>

          <details open>
            <summary>Animation</summary>
            <div className="ui-details-body">
              <label className="ui-field">
                <span className="ui-field-header">Mode</span>
                <select value={animationMode} onChange={(e) => setAnimationMode(e.target.value as AnimationMode)}>
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
                    <input type="range" min={FADE_MIN} max={FADE_MAX} step={0.01} value={startFade} onChange={(e) => setStartFade(Number(e.target.value))} />
                  </label>
                  <label className="ui-field">
                    <span className="ui-field-header">
                      Fade to
                      <output>{`${endFade > 0 ? '+' : ''}${endFade.toFixed(2)}`}</output>
                    </span>
                    <input type="range" min={FADE_MIN} max={FADE_MAX} step={0.01} value={endFade} onChange={(e) => setEndFade(Number(e.target.value))} />
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
              <label className="ui-field">
                <span className="ui-field-header">
                  Frames
                  <output>{totalFrames}</output>
                </span>
                <input type="range" min={FRAMES_MIN} max={FRAMES_MAX} step={1} value={totalFrames} onChange={(e) => setTotalFrames(Number(e.target.value))} />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Speed
                  <output>{playbackSpeed.toFixed(1)}x</output>
                </span>
                <input type="range" min={SPEED_MIN} max={SPEED_MAX} step={0.1} value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))} />
              </label>
            </div>
          </details>

          <details open>
            <summary>Seed</summary>
            <div className="ui-details-body">
              <label className="ui-field">
                <span className="ui-field-header">Seed</span>
                <input type="text" value={seed} onChange={(e) => setSeed(e.target.value)} spellCheck={false} />
              </label>
              <label className="ui-check">
                <input type="checkbox" checked={shuffleOnLoop} onChange={(e) => setShuffleOnLoop(e.target.checked)} />
                Shuffle seed on loop
              </label>
              <button type="button" onClick={() => setSeed(randomSeed())}>
                Regenerate
              </button>
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
      <canvas ref={canvasRef} className={styles.canvas} />
    </AppFrame>
  )
}

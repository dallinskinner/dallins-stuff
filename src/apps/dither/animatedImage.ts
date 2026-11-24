/** Browsers hand WebGL only the first frame of an animated <img>, so animated images (GIF, WebP) are decoded
 *  up front with WebCodecs and played back onto a canvas that can be uploaded like any other source. */
export interface AnimatedImage {
  canvas: HTMLCanvasElement
  /** Total length of one loop, in ms, at normal speed. */
  duration: number
  /** Playback speed multiplier; 1 is the GIF's own timing. */
  speed: number
  /** Call once per frame with a timestamp in ms; moves to the right frame and redraws the canvas when it changes. */
  advance: (now: number) => void
  /** Jumps back to the first frame, so the next `advance` starts a fresh loop. */
  restart: () => void
  /** Called when playback wraps back to the first frame. */
  onLoop: (() => void) | null
  dispose: () => void
}

/** The `delay` browsers use for GIFs that ask for 0 or 10ms or less. */
const DEFAULT_FRAME_MS = 100

/** Returns null when the file has a single frame or the browser can't decode animations (no `ImageDecoder`). */
export async function decodeAnimatedImage(file: File): Promise<AnimatedImage | null> {
  if (typeof ImageDecoder === 'undefined') return null

  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type })
  const frames: ImageBitmap[] = []
  const durations: number[] = []
  try {
    await decoder.tracks.ready
    const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0
    if (frameCount <= 1) return null
    for (let i = 0; i < frameCount; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      frames.push(await createImageBitmap(image))
      const ms = (image.duration ?? 0) / 1000
      durations.push(ms > 10 ? ms : DEFAULT_FRAME_MS)
      image.close()
    }
  } catch (error) {
    for (const frame of frames) frame.close()
    throw error
  } finally {
    decoder.close()
  }

  const canvas = document.createElement('canvas')
  canvas.width = frames[0].width
  canvas.height = frames[0].height
  const ctx = canvas.getContext('2d')!

  let index = 0
  // Playback runs on its own clock, advanced by real elapsed time times `speed`.
  let clock = 0
  let last: number | null = null
  let nextAt = 0
  let drawn = -1
  const draw = () => {
    if (drawn === index) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(frames[index], 0, 0)
    drawn = index
  }
  draw()

  const animation: AnimatedImage = {
    canvas,
    duration: durations.reduce((sum, ms) => sum + ms, 0),
    speed: 1,
    onLoop: null,
    advance(now) {
      // Capped so a long pause (e.g. a hidden tab) resumes from here rather than racing through the backlog.
      const elapsed = last === null ? 0 : Math.min(now - last, 250)
      last = now
      clock += elapsed * animation.speed
      if (nextAt === 0) nextAt = clock + durations[index]
      while (clock >= nextAt) {
        index = (index + 1) % frames.length
        nextAt += durations[index]
        if (index === 0) animation.onLoop?.()
      }
      draw()
    },
    restart() {
      index = 0
      nextAt = 0
      draw()
    },
    dispose() {
      for (const frame of frames) frame.close()
      frames.length = 0
    },
  }
  return animation
}

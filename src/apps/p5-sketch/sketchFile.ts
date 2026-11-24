import type { Scene } from './scene'
import { sanitizeScene } from './scene'

const FORMAT = 'dallins-p5-sketch'
/** 1 held only `code`; 2 adds the GUI scene. Both load. */
const VERSION = 2

/** The p5 version sketches run on; saved into files so a later upgrade can tell which one they were written for. */
export const P5_VERSION = '1.11.13'

interface SketchFile {
  format: typeof FORMAT
  version: number
  p5: string
  title: string
  /** Whether the sketch is driven by `scene` or is free-form `code`. */
  source: 'scene' | 'code'
  code: string
  scene?: Scene
}

export interface Sketch {
  title: string
  source: 'scene' | 'code'
  code: string
  scene: Scene | null
}

export function serializeSketch({ title, source, code, scene }: Sketch): string {
  const file: SketchFile = { format: FORMAT, version: VERSION, p5: P5_VERSION, title, source, code, ...(scene ? { scene } : {}) }
  return JSON.stringify(file, null, 2)
}

/** Throws a readable Error if `text` isn't a valid sketch file. */
export function parseSketch(text: string): Sketch {
  let data: Partial<SketchFile>
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Not a JSON file.')
  }
  if (data.format !== FORMAT) throw new Error('Not a p5 sketch file.')
  if (data.version !== 1 && data.version !== VERSION) throw new Error(`Unsupported sketch version ${data.version}.`)
  const title = typeof data.title === 'string' && data.title ? data.title : 'sketch'
  const code = typeof data.code === 'string' ? data.code : ''
  const scene = data.scene !== undefined ? sanitizeScene(data.scene) : null
  if (data.version === 1 || data.source === 'code' || !scene) {
    if (typeof data.code !== 'string') throw new Error('Sketch file has no code.')
    return { title, source: 'code', code, scene }
  }
  return { title, source: 'scene', code, scene }
}

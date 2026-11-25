/** The GUI mode's model: a stack of shapes whose properties are each driven by a constant, a wave or an expression.
 *  `codegen.ts` turns it into p5 code. */

export type Wave = 'sin' | 'cos' | 'tri' | 'saw'
export const WAVES: Wave[] = ['sin', 'cos', 'tri', 'saw']

export type Ease = 'none' | 'in' | 'out' | 'inOut' | 'bounce' | 'elastic'
export const EASES: { id: Ease; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'in', label: 'Ease in' },
  { id: 'out', label: 'Ease out' },
  { id: 'inOut', label: 'Ease in-out' },
  { id: 'bounce', label: 'Bounce' },
  { id: 'elastic', label: 'Elastic' },
]

export type DriverKind = 'const' | 'wave' | 'expr'

/** `step` on every driver is added once per copy of a repeated shape (value + i * step). */
export interface ConstDriver {
  kind: 'const'
  value: number
  step: number
}

/** center + amp * wave(cycles * p + phase + i * phaseStep), where p runs 0 to 1 over the loop. */
export interface WaveDriver {
  kind: 'wave'
  wave: Wave
  /** Reshapes the wave's output; with a triangle or saw wave this is the classic eased back-and-forth or sweep. */
  ease: Ease
  center: number
  amp: number
  /** Whole cycles per loop keep the animation seamless. */
  cycles: number
  /** In cycles, so 0.25 is a quarter turn. */
  phase: number
  phaseStep: number
  step: number
}

/** A p5 expression that can use t (seconds), p (0-1 through the loop), i and n (copy index and count), and p5's own functions. */
export interface ExprDriver {
  kind: 'expr'
  source: string
}

export type Driver = ConstDriver | WaveDriver | ExprDriver

export type ShapeType = 'circle' | 'rect' | 'line' | 'box' | 'sphere'
export const SHAPE_LABELS: Record<ShapeType, string> = { circle: 'Circle', rect: 'Rectangle', line: 'Line', box: 'Box', sphere: 'Sphere' }

/** Shapes that only exist in a 3D scene. */
export const SHAPES_3D: ShapeType[] = ['box', 'sphere']
export const is3D = (type: ShapeType) => SHAPES_3D.includes(type)

export type SceneMode = '2d' | '3d'

export interface Shape {
  id: number
  type: ShapeType
  name: string
  color: string
  /** Stroke instead of fill. Lines are always strokes. */
  outline: boolean
  repeat: number
  props: Record<string, Driver>
}

export interface Scene {
  /** A 3D scene draws on a WEBGL canvas: x and y stay in canvas pixels, and 3D shapes add z and rotation on every axis. */
  mode: SceneMode
  /** 3D only: light the shapes (otherwise they're flat-colored). */
  lights: boolean
  width: number
  height: number
  background: string
  /** Seconds per loop. */
  loop: number
  shapes: Shape[]
}

export const MAX_REPEAT = 200
export const MIN_CANVAS = 16
export const MAX_CANVAS = 2048

export interface PropSpec {
  key: string
  label: string
  min: number
  max: number
  step: number
}

/** Whether a shape's `weight` prop is used: outlined shapes (wireframes, in 3D) and lines. */
export function usesWeight(shape: Pick<Shape, 'type' | 'outline'>): boolean {
  return shape.type === 'line' || shape.outline
}

/** The dials a shape has, with slider ranges that follow the canvas size. */
export function propSpecs(shape: Pick<Shape, 'type' | 'outline'>, scene: Pick<Scene, 'width' | 'height'>): PropSpec[] {
  const { width, height } = scene
  const big = Math.max(width, height)
  const x: PropSpec = { key: 'x', label: 'X', min: 0, max: width, step: 1 }
  const y: PropSpec = { key: 'y', label: 'Y', min: 0, max: height, step: 1 }
  const rotation: PropSpec = { key: 'rotation', label: 'Rotation', min: -360, max: 360, step: 1 }
  const opacity: PropSpec = { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01 }
  const weight: PropSpec = { key: 'weight', label: 'Line weight', min: 0, max: 40, step: 0.5 }
  const z: PropSpec = { key: 'z', label: 'Z', min: -big, max: big, step: 1 }
  const turns: PropSpec[] = [
    { key: 'rotX', label: 'Rotate X', min: -360, max: 360, step: 1 },
    { key: 'rotY', label: 'Rotate Y', min: -360, max: 360, step: 1 },
    { key: 'rotZ', label: 'Rotate Z', min: -360, max: 360, step: 1 },
  ]
  const specs: PropSpec[] =
    shape.type === 'circle'
      ? [x, y, { key: 'size', label: 'Size', min: 0, max: big, step: 1 }]
      : shape.type === 'rect'
        ? [x, y, { key: 'w', label: 'Width', min: 0, max: width, step: 1 }, { key: 'h', label: 'Height', min: 0, max: height, step: 1 }, rotation]
        : shape.type === 'box'
          ? [x, y, z, { key: 'w', label: 'Width', min: 0, max: width, step: 1 }, { key: 'h', label: 'Height', min: 0, max: height, step: 1 }, { key: 'd', label: 'Depth', min: 0, max: big, step: 1 }, ...turns]
          : shape.type === 'sphere'
            ? [x, y, z, { key: 'size', label: 'Size', min: 0, max: big, step: 1 }, ...turns]
            : [x, y, { key: 'length', label: 'Length', min: 0, max: big, step: 1 }, rotation]
  specs.push(opacity)
  if (usesWeight(shape)) specs.push(weight)
  return specs
}

export function constDriver(value: number): ConstDriver {
  return { kind: 'const', value, step: 0 }
}

/** Dials for a new shape placed at (x, y). */
export function defaultProps(type: ShapeType, x: number, y: number): Record<string, Driver> {
  const common = { x: constDriver(x), y: constDriver(y), opacity: constDriver(1), weight: constDriver(1) }
  const turns = { rotX: constDriver(0), rotY: constDriver(0), rotZ: constDriver(0) }
  if (type === 'circle') return { ...common, weight: constDriver(4), size: constDriver(80) }
  if (type === 'rect') return { ...common, weight: constDriver(4), w: constDriver(100), h: constDriver(60), rotation: constDriver(0) }
  if (type === 'box') return { ...common, z: constDriver(0), w: constDriver(100), h: constDriver(100), d: constDriver(100), ...turns }
  if (type === 'sphere') return { ...common, z: constDriver(0), size: constDriver(100), ...turns }
  return { ...common, weight: constDriver(4), length: constDriver(120), rotation: constDriver(0) }
}

let nextShapeId = 1

export function createShape(type: ShapeType, x: number, y: number, existing: Shape[]): Shape {
  const count = existing.filter((shape) => shape.type === type).length + 1
  return {
    id: nextShapeId++,
    type,
    name: `${SHAPE_LABELS[type]} ${count}`,
    color: '#ffffff',
    outline: false,
    repeat: 1,
    props: defaultProps(type, Math.round(x), Math.round(y)),
  }
}

/** A copy with a fresh id, nudged so it doesn't sit exactly on the original. */
export function duplicateShape(shape: Shape): Shape {
  const copy: Shape = { ...structuredClone(shape), id: nextShapeId++, name: `${shape.name} copy` }
  for (const key of ['x', 'y']) {
    const driver = copy.props[key]
    if (driver?.kind === 'const') driver.value += 20
    else if (driver?.kind === 'wave') driver.center += 20
  }
  return copy
}

/** The driver's value now, or the middle of the slider range when it's an expression. */
export function currentValue(driver: Driver, spec: PropSpec): number {
  if (driver.kind === 'const') return driver.value
  if (driver.kind === 'wave') return driver.center
  return (spec.min + spec.max) / 2
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Switches a dial to another kind, carrying its current behavior over where it can. */
export function convertDriver(driver: Driver, kind: DriverKind, spec: PropSpec): Driver {
  if (driver.kind === kind) return driver
  const value = round(currentValue(driver, spec))
  if (kind === 'const') return { kind: 'const', value, step: driver.kind === 'expr' ? 0 : driver.step }
  if (kind === 'wave') {
    const step = driver.kind === 'expr' ? 0 : driver.step
    return { kind: 'wave', wave: 'sin', ease: 'none', center: value, amp: round((spec.max - spec.min) / 8), cycles: 1, phase: 0, phaseStep: 0, step }
  }
  if (driver.kind === 'wave') {
    const { wave, ease, center, amp, cycles, phase } = driver
    const raw = `W.${wave}(${cycles} * p + ${phase})`
    return { kind: 'expr', source: `${center} + ${amp} * ${ease === 'none' ? raw : `E.${ease}(${raw})`}` }
  }
  return { kind: 'expr', source: String(value) }
}

/** A new sketch starts as a blank canvas. */
export function createDefaultScene(): Scene {
  return { mode: '2d', lights: true, width: 400, height: 400, background: '#141414', loop: 6, shapes: [] }
}

// --- Loading from a file: coerce whatever's there into something safe to generate code from. ---

const HEX = /^#[0-9a-f]{6}$/i
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const finite = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

function sanitizeDriver(raw: unknown, fallback: Driver): Driver {
  if (!isRecord(raw)) return fallback
  if (raw.kind === 'const') return { kind: 'const', value: finite(raw.value, 0), step: finite(raw.step, 0) }
  if (raw.kind === 'expr') return { kind: 'expr', source: typeof raw.source === 'string' ? raw.source : '0' }
  if (raw.kind === 'wave') {
    return {
      kind: 'wave',
      wave: WAVES.includes(raw.wave as Wave) ? (raw.wave as Wave) : 'sin',
      ease: EASES.some((e) => e.id === raw.ease) ? (raw.ease as Ease) : 'none',
      center: finite(raw.center, 0),
      amp: finite(raw.amp, 0),
      cycles: finite(raw.cycles, 1),
      phase: finite(raw.phase, 0),
      phaseStep: finite(raw.phaseStep, 0),
      step: finite(raw.step, 0),
    }
  }
  return fallback
}

/** Throws if `raw` isn't recognizably a scene. */
export function sanitizeScene(raw: unknown): Scene {
  if (!isRecord(raw) || !Array.isArray(raw.shapes)) throw new Error('Sketch file has no scene.')
  const clampCanvas = (value: unknown) => Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(finite(value, 400))))
  const shapes: Shape[] = []
  for (const entry of raw.shapes) {
    if (!isRecord(entry) || typeof entry.type !== 'string' || !(entry.type in SHAPE_LABELS)) continue
    const type = entry.type as ShapeType
    const defaults = defaultProps(type, 0, 0)
    const given = isRecord(entry.props) ? entry.props : {}
    const props: Record<string, Driver> = {}
    for (const key of Object.keys(defaults)) props[key] = sanitizeDriver(given[key], defaults[key])
    shapes.push({
      id: nextShapeId++,
      type,
      name: typeof entry.name === 'string' ? entry.name : SHAPE_LABELS[type],
      color: typeof entry.color === 'string' && HEX.test(entry.color) ? entry.color : '#ffffff',
      outline: entry.outline === true,
      repeat: Math.min(MAX_REPEAT, Math.max(1, Math.round(finite(entry.repeat, 1)))),
      props,
    })
  }
  // A scene is 3D only if it says so; older files have no mode. Any 3D shape in a 2D file would be undrawable, so it forces 3D.
  const mode: SceneMode = raw.mode === '3d' || shapes.some((shape) => is3D(shape.type)) ? '3d' : '2d'
  return {
    mode,
    lights: raw.lights !== false,
    width: clampCanvas(raw.width),
    height: clampCanvas(raw.height),
    background: typeof raw.background === 'string' && HEX.test(raw.background) ? raw.background : '#141414',
    loop: Math.min(120, Math.max(0.5, finite(raw.loop, 6))),
    shapes,
  }
}

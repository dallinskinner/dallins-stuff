import type { Driver, Scene, Shape } from './scene'
import { propSpecs } from './scene'

/** Wraps an expression for embedding. A trailing line break keeps a `//` comment from swallowing the bracket. */
function wrapExpression(source: string): string {
  return source.includes('//') || source.includes('/*') ? `(${source}\n)` : `(${source})`
}

/** Returns an error message, or null if `source` can be used as an expression. Only parses; never runs it. */
export function validateExpression(source: string): string | null {
  try {
    new Function('t', 'p', 'i', 'n', `return ${wrapExpression(source)}`)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid expression'
  }
}

/** What the running sketch reads its numbers from, so dials can change without restarting it. */
export interface LiveParams {
  bg: string
  loop: number
  /** Selection rings, drawn only while editing. */
  guides: boolean
  /** Index of the selected shape, or -1. */
  sel: number
  s: { repeat: number; color: string; d: Record<string, Driver> }[]
}

export interface Generated {
  /** The sketch. In live mode it reads `P` and has no numbers that dials change, so it only differs when the structure does. */
  body: string
  params: LiveParams
}

const num = (n: number) => String(Math.round(n * 1000) / 1000)

const EASING_HELPERS = `// Easing: reshapes a wave's -1 to 1 output.
const ease = (f) => (v) => f((v + 1) / 2) * 2 - 1
const E = {
  in: ease((x) => x * x * x),
  out: ease((x) => 1 - pow(1 - x, 3)),
  inOut: ease((x) => (x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2)),
  bounce: ease((x) => {
    if (x < 1 / 2.75) return 7.5625 * x * x
    if (x < 2 / 2.75) return 7.5625 * (x -= 1.5 / 2.75) * x + 0.75
    if (x < 2.5 / 2.75) return 7.5625 * (x -= 2.25 / 2.75) * x + 0.9375
    return 7.5625 * (x -= 2.625 / 2.75) * x + 0.984375
  }),
  elastic: ease((x) => (x === 0 || x === 1 ? x : pow(2, -10 * x) * sin((x * 10 - 0.75) * ((2 * PI) / 3)) + 1)),
}`

const HELPERS = `// Wave shapes: c is the position in a cycle, so 1 is one full turn.
const W = {
  sin: (c) => sin(TWO_PI * c),
  cos: (c) => cos(TWO_PI * c),
  tri: (c) => (2 / PI) * asin(sin(TWO_PI * c)),
  saw: (c) => 2 * (((c % 1) + 1) % 1) - 1,
}`

/** Live mode references `P`; flat mode writes the numbers into the code, for reading and for converting to a free-form sketch. */
export function generateSketch(scene: Scene, live: boolean): Generated {
  const params: LiveParams = {
    bg: scene.background,
    loop: scene.loop,
    guides: false,
    sel: -1,
    s: scene.shapes.map((shape) => ({ repeat: shape.repeat, color: shape.color, d: shape.props })),
  }

  const lines: string[] = []
  if (live) lines.push('var HITS = [] // where each shape was drawn, for picking with the mouse', '')
  // Live sketches always carry the easing helpers so switching one on doesn't change the structure; flat code only when used.
  const usesEasing = scene.shapes.some((shape) =>
    Object.values(shape.props).some((d) => (d.kind === 'wave' && d.ease !== 'none') || (d.kind === 'expr' && d.source.includes('E.'))),
  )
  lines.push(HELPERS, '')
  if (live || usesEasing) lines.push(EASING_HELPERS, '')
  lines.push('function setup() {', `  createCanvas(${scene.width}, ${scene.height})`, '}', '', 'function draw() {')
  lines.push('  const t = millis() / 1000 // seconds since the sketch started')
  lines.push(`  const p = (t / ${live ? 'P.loop' : num(scene.loop)}) % 1 // 0 to 1 through the loop`)
  lines.push(`  background(${live ? 'P.bg' : JSON.stringify(scene.background)})`)
  if (live) lines.push('  HITS.length = 0')

  scene.shapes.forEach((shape, k) => {
    lines.push('', ...shapeBlock(scene, shape, k, live))
  })

  if (live) {
    lines.push(
      '',
      '  if (P.guides) {',
      '    push()',
      '    noFill()',
      '    stroke(255, 60, 200)',
      '    strokeWeight(1.5)',
      '    drawingContext.setLineDash([4, 4])',
      '    for (const h of HITS) if (h.k === P.sel) circle(h.x, h.y, h.r * 2 + 8)',
      '    pop()',
      '  }',
    )
  }
  lines.push('}', '')

  const body = lines.join('\n')
  return {
    body: live ? body : `// Generated from the GUI scene. Loop length: ${num(scene.loop)}s.\n${body}`,
    params,
  }
}

function driverExpression(k: number, key: string, driver: Driver, live: boolean): string {
  const ref = (field: string, value: number) => (live ? `P.s[${k}].d.${key}.${field}` : num(value))
  if (driver.kind === 'expr') {
    return validateExpression(driver.source) === null ? wrapExpression(driver.source) : '0 /* invalid expression */'
  }
  if (driver.kind === 'const') {
    const step = live || driver.step !== 0 ? ` + i * ${ref('step', driver.step)}` : ''
    return `${ref('value', driver.value)}${step}`
  }
  const phaseStep = live || driver.phaseStep !== 0 ? ` + i * ${ref('phaseStep', driver.phaseStep)}` : ''
  const step = live || driver.step !== 0 ? ` + i * ${ref('step', driver.step)}` : ''
  const raw = `W.${driver.wave}(${ref('cycles', driver.cycles)} * p + ${ref('phase', driver.phase)}${phaseStep})`
  const wave = driver.ease === 'none' ? raw : `E.${driver.ease}(${raw})`
  return `${ref('center', driver.center)} + ${ref('amp', driver.amp)} * ${wave}${step}`
}

function shapeBlock(scene: Scene, shape: Shape, k: number, live: boolean): string[] {
  const specs = propSpecs(shape, scene)
  const has = (key: string) => specs.some((spec) => spec.key === key)
  const repeat = live ? `P.s[${k}].repeat` : String(shape.repeat)
  const color = live ? `P.s[${k}].color` : JSON.stringify(shape.color)

  const out = [`  // ${shape.name.replace(/[\r\n]+/g, ' ')}`, `  const n${k} = ${repeat}`, `  for (let i = 0; i < n${k}; i++) {`, `    const n = n${k}`]
  for (const { key } of specs) out.push(`    const ${key} = ${driverExpression(k, key, shape.props[key], live)}`)

  out.push('    push()', '    drawingContext.globalAlpha = constrain(opacity, 0, 1)')
  if (shape.type === 'line' || shape.outline) out.push('    noFill()', `    stroke(${color})`, '    strokeWeight(weight)', '    strokeCap(ROUND)')
  else out.push('    noStroke()', `    fill(${color})`)
  out.push('    translate(x, y)')
  if (has('rotation')) out.push('    rotate(radians(rotation))')

  let radius: string
  if (shape.type === 'circle') {
    out.push('    circle(0, 0, size)')
    radius = 'size / 2'
  } else if (shape.type === 'rect') {
    out.push('    rectMode(CENTER)', '    rect(0, 0, w, h)')
    radius = 'max(w, h) / 2'
  } else {
    out.push('    line(-length / 2, 0, length / 2, 0)')
    radius = 'length / 2'
  }
  out.push('    pop()')
  if (live) out.push(`    HITS.push({ k: ${k}, x, y, r: max(${radius}, 8) })`)
  out.push('  }')
  return out
}

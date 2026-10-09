export interface SampledColor {
  hex: string
  l: number
  c: number
  h: number
}

export interface Point {
  x: number
  y: number
}

export interface Annotation {
  /** The point that was actually sampled — stays fixed once placed. */
  origin: Point
  /** Where the readout box renders; draggable independently of origin. */
  anchor: Point
}

export interface PaletteColor extends SampledColor {
  id: number
  annotation?: Annotation
}

export interface ThemeColors {
  background: string
  foreground: string
  border: string
  accent: string
}

// Chroma rarely exceeds ~0.32 for in-gamut sRGB colors; used to scale the chroma bar to 0-100%.
const MAX_CHROMA = 0.32

export function lightnessPercent(l: number): number {
  return Math.round(l * 100)
}

export function chromaPercent(c: number): number {
  return Math.round(Math.min(100, (c / MAX_CHROMA) * 100))
}

// Annotation box size, in canvas pixels, before the resolution scale factor is applied.
const BOX_WIDTH = 160
const BOX_HEIGHT = 156
const PADDING = 10
const SWATCH_HEIGHT = 34
const TEXT_LINE_HEIGHT = 15
const STAT_ROW_HEIGHT = 20
const ROW_GAP = 6

/** Annotation boxes are drawn in raw canvas pixels, but a photo can be many times the on-screen
 *  display size — without scaling, a box sized for a ~900px-wide image would render illegibly small
 *  on a 4000px photo. Scaling relative to the canvas's own resolution (rather than its current CSS
 *  display size) keeps it readable both on screen and in a flattened, possibly-detached export
 *  canvas, where there's no "display size" to measure. */
export function getAnnotationScale(canvasWidth: number): number {
  return Math.max(1, canvasWidth / 900)
}

function boxRect(anchor: Point, scale: number) {
  return { x: anchor.x, y: anchor.y, width: BOX_WIDTH * scale, height: BOX_HEIGHT * scale }
}

/** Where the leader line should meet the box: the left edge if the box is to the right of the
 *  origin, the right edge if it's to the left — so dragging further in +x/-x always attaches to the
 *  near side instead of the line cutting across the box toward a fixed corner. Falls back to the
 *  nearest top/bottom edge when the origin's x falls within the box's own span (a mostly-vertical
 *  drag). */
function boxAttachPoint(origin: Point, rect: { x: number; y: number; width: number; height: number }): Point {
  const y = Math.min(Math.max(origin.y, rect.y), rect.y + rect.height)
  if (origin.x < rect.x) return { x: rect.x, y }
  if (origin.x > rect.x + rect.width) return { x: rect.x + rect.width, y }

  const x = Math.min(Math.max(origin.x, rect.x), rect.x + rect.width)
  return { x, y: origin.y < rect.y ? rect.y : rect.y + rect.height }
}

/** Returns the id of the topmost placed annotation whose box contains (x, y), for drag-to-reposition. */
export function hitTestAnnotationAnchor(palette: PaletteColor[], x: number, y: number, scale: number): number | null {
  for (let i = palette.length - 1; i >= 0; i--) {
    const swatch = palette[i]
    if (!swatch.annotation) continue
    const rect = boxRect(swatch.annotation.anchor, scale)
    if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
      return swatch.id
    }
  }
  return null
}

function drawLeaderLine(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  anchor: Point,
  color: string,
  theme: ThemeColors,
  scale: number,
  dashed: boolean,
) {
  ctx.save()
  ctx.strokeStyle = theme.foreground
  ctx.lineWidth = 1.5 * scale
  ctx.setLineDash(dashed ? [5 * scale, 4 * scale] : [])
  ctx.beginPath()
  ctx.moveTo(origin.x, origin.y)
  ctx.lineTo(anchor.x, anchor.y)
  ctx.stroke()

  // Filled with the sampled color and drawn over the line, so the line reads as stopping at the
  // ring's edge instead of visibly cutting across the middle of it.
  ctx.setLineDash([])
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(origin.x, origin.y, 5 * scale, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 2 * scale
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  ctx.restore()
}

/** Draws the in-progress leader line, plus a dashed outline at the exact size/position the box will
 *  render at, while dragging out a new annotation — previews the result without committing it (the
 *  color is only added to the palette on release). */
export function drawDragPreview(
  ctx: CanvasRenderingContext2D,
  origin: Point,
  anchor: Point,
  color: string,
  theme: ThemeColors,
  scale: number,
) {
  const rect = boxRect(anchor, scale)
  drawLeaderLine(ctx, origin, boxAttachPoint(origin, rect), color, theme, scale, true)

  const radius = 6 * scale

  ctx.save()
  ctx.strokeStyle = theme.foreground
  ctx.lineWidth = 1.5 * scale
  ctx.setLineDash([5 * scale, 4 * scale])
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
  ctx.stroke()
  ctx.restore()
}

/** Draws a "stat row": a pill with the label on the left and the value on the right, filled from the
 *  left by `fillPercent` (if given) to double as a bar graph — mirrors the side-panel's StatRow. */
function drawStatRow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  fillPercent: number | undefined,
  theme: ThemeColors,
  scale: number,
) {
  const radius = height / 4

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
  ctx.clip()

  ctx.fillStyle = theme.border
  ctx.fillRect(x, y, width, height)
  if (fillPercent !== undefined) {
    ctx.fillStyle = theme.accent
    ctx.globalAlpha = 0.55
    ctx.fillRect(x, y, (width * fillPercent) / 100, height)
    ctx.globalAlpha = 1
  }
  ctx.restore()

  const textPadding = 8 * scale
  const textY = y + height / 2
  ctx.fillStyle = theme.foreground
  ctx.font = `600 ${11 * scale}px ui-monospace, monospace`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(label, x + textPadding, textY)
  ctx.textAlign = 'right'
  ctx.fillText(value, x + width - textPadding, textY)
  ctx.textAlign = 'left'
}

/** Draws a placed annotation: the leader line plus a box replicating the side-panel sample readout
 *  (swatch, hex, lightness/chroma bar rows, hue) at the anchor point. */
export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  swatch: PaletteColor & { annotation: Annotation },
  theme: ThemeColors,
  scale: number,
) {
  const { origin, anchor } = swatch.annotation
  const rect = boxRect(anchor, scale)
  drawLeaderLine(ctx, origin, boxAttachPoint(origin, rect), swatch.hex, theme, scale, false)

  const padding = PADDING * scale
  const radius = 6 * scale
  const rowGap = ROW_GAP * scale

  ctx.save()
  ctx.fillStyle = theme.background
  ctx.strokeStyle = theme.border
  ctx.lineWidth = 1 * scale
  ctx.beginPath()
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius)
  ctx.fill()
  ctx.stroke()

  let y = rect.y + padding
  const contentX = rect.x + padding
  const contentWidth = rect.width - padding * 2

  ctx.fillStyle = swatch.hex
  ctx.fillRect(contentX, y, contentWidth, SWATCH_HEIGHT * scale)
  ctx.strokeStyle = theme.border
  ctx.strokeRect(contentX, y, contentWidth, SWATCH_HEIGHT * scale)
  y += SWATCH_HEIGHT * scale + rowGap

  ctx.fillStyle = theme.foreground
  ctx.font = `${11 * scale}px ui-monospace, monospace`
  ctx.textBaseline = 'top'
  ctx.fillText(`Hex  ${swatch.hex}`, contentX, y)
  y += TEXT_LINE_HEIGHT * scale + rowGap

  drawStatRow(ctx, contentX, y, contentWidth, STAT_ROW_HEIGHT * scale, 'Lightness', `${lightnessPercent(swatch.l)}%`, lightnessPercent(swatch.l), theme, scale)
  y += STAT_ROW_HEIGHT * scale + rowGap

  drawStatRow(ctx, contentX, y, contentWidth, STAT_ROW_HEIGHT * scale, 'Chroma', swatch.c.toFixed(3), chromaPercent(swatch.c), theme, scale)
  y += STAT_ROW_HEIGHT * scale + rowGap

  ctx.fillStyle = theme.foreground
  ctx.font = `${11 * scale}px ui-monospace, monospace`
  ctx.textBaseline = 'top'
  ctx.fillText(`Hue  ${Math.round(swatch.h)}°`, contentX, y)

  ctx.restore()
}

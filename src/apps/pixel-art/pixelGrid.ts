export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

/** grid[row][col]; grid.length === height, grid[0].length === width. Row-major to match ImageData's memory layout. */
export type PixelGrid = RGBA[][]

export const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 }

export const GRID_WIDTH = 32
export const GRID_HEIGHT = 32

export function createGrid(width: number, height: number, fill: RGBA = TRANSPARENT): PixelGrid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ...fill })))
}

export function cloneGrid(grid: PixelGrid): PixelGrid {
  return grid.map((row) => row.map((cell) => ({ ...cell })))
}

export function flipHorizontal(grid: PixelGrid): PixelGrid {
  return grid.map((row) => [...row].reverse())
}

export function flipVertical(grid: PixelGrid): PixelGrid {
  return [...grid].reverse()
}

/** Resizes to a new width/height, keeping the overlapping top-left region and filling new area as transparent. */
export function resizeGrid(grid: PixelGrid, width: number, height: number): PixelGrid {
  const next = createGrid(width, height)
  const copyHeight = Math.min(grid.length, height)
  const copyWidth = Math.min(grid[0]?.length ?? 0, width)
  for (let row = 0; row < copyHeight; row++) {
    for (let col = 0; col < copyWidth; col++) {
      next[row][col] = { ...grid[row][col] }
    }
  }
  return next
}

/** Renders the grid to ImageData; with `backdrop`, fully transparent pixels show that color instead (the NES backdrop). */
export function gridToImageData(grid: PixelGrid, backdrop?: RGBA): ImageData {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const { r, g, b, a } = backdrop && grid[row][col].a === 0 ? backdrop : grid[row][col]
      const i = (row * width + col) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return new ImageData(data, width, height)
}

/** Midpoint ellipse algorithm: same incremental, sqrt/trig-free approach as Bresenham's circle, split
 *  into two regions (slope above/below -1) since rx and ry advance at different rates. */
function midpointEllipse(cx: number, cy: number, rx: number, ry: number): { row: number; col: number }[] {
  const points: { row: number; col: number }[] = []
  const plot = (x: number, y: number) => {
    points.push({ row: cy + y, col: cx + x })
    points.push({ row: cy + y, col: cx - x })
    points.push({ row: cy - y, col: cx + x })
    points.push({ row: cy - y, col: cx - x })
  }

  let x = 0
  let y = ry
  const rx2 = rx * rx
  const ry2 = ry * ry

  let px = 0
  let py = 2 * rx2 * y

  let p1 = ry2 - rx2 * ry + 0.25 * rx2
  while (px < py) {
    plot(x, y)
    x++
    px += 2 * ry2
    if (p1 < 0) {
      p1 += ry2 + px
    } else {
      y--
      py -= 2 * rx2
      p1 += ry2 + px - py
    }
  }

  let p2 = ry2 * (x + 0.5) ** 2 + rx2 * (y - 1) ** 2 - rx2 * ry2
  while (y >= 0) {
    plot(x, y)
    y--
    py -= 2 * rx2
    if (p2 > 0) {
      p2 += rx2 - py
    } else {
      x++
      px += 2 * ry2
      p2 += rx2 - py + px
    }
  }

  return points
}

/** Ellipse outline inscribed in the bounding box between two opposite corners. */
export function ellipseCells(r0: number, c0: number, r1: number, c1: number): { row: number; col: number }[] {
  const rowMin = Math.min(r0, r1)
  const rowMax = Math.max(r0, r1)
  const colMin = Math.min(c0, c1)
  const colMax = Math.max(c0, c1)

  if (rowMin === rowMax && colMin === colMax) return [{ row: rowMin, col: colMin }]
  if (rowMin === rowMax) {
    const cells: { row: number; col: number }[] = []
    for (let col = colMin; col <= colMax; col++) cells.push({ row: rowMin, col })
    return cells
  }
  if (colMin === colMax) {
    const cells: { row: number; col: number }[] = []
    for (let row = rowMin; row <= rowMax; row++) cells.push({ row, col: colMin })
    return cells
  }

  // Work at 2x resolution so the center and radii stay exact integers (colMin+colMax is always
  // whole, even when the box has an even width and the true center falls on a half-cell). Rounding
  // rx/ry to the nearest cell *before* rasterizing would make the shape only respond to every other
  // pixel of drag distance; rounding the plotted points down to cells afterwards doesn't.
  const cx2 = colMin + colMax
  const cy2 = rowMin + rowMax
  const rx2 = colMax - colMin
  const ry2 = rowMax - rowMin

  const cells = new Map<string, { row: number; col: number }>()
  for (const p of midpointEllipse(0, 0, rx2, ry2)) {
    const row = roundHalfAwayFromCenter(cy2 + p.row, p.row)
    const col = roundHalfAwayFromCenter(cx2 + p.col, p.col)
    cells.set(`${row},${col}`, { row, col })
  }
  return removeCorners(cells, cy2, cx2)
}

/** Where a horizontal and a vertical run meet in an L, the corner pixel makes that spot read as a bolder line
 *  (or, on the outside, as a squared-off notch). Drops each such corner, leaving its two neighbors diagonally
 *  connected — the cleanup a pixel artist would otherwise do by hand. `cy2`/`cx2` are the center at 2x
 *  resolution, so a cell's mirror image is at `cy2 - row` / `cx2 - col`. */
function removeCorners(cells: Map<string, { row: number; col: number }>, cy2: number, cx2: number) {
  const live = new Map(cells)
  const has = (row: number, col: number) => live.has(`${row},${col}`)
  const rows = [...cells.values()].map((c) => c.row)
  const cols = [...cells.values()].map((c) => c.col)
  const [rowMin, rowMax, colMin, colMax] = [Math.min(...rows), Math.max(...rows), Math.min(...cols), Math.max(...cols)]
  const isCircle = rowMax - rowMin === colMax - colMin

  const cornerKind = ({ row, col }: { row: number; col: number }): 'inside' | 'outside' | null => {
    let kind: 'inside' | 'outside' | null = null
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        // Horizontal neighbor (row, col+s) and vertical neighbor (row+t, col) form an L with this cell as the
        // corner. It's on the inside when it sits on the center's side of the diagonal between those neighbors,
        // i.e. the corner's offset from that diagonal's midpoint, (-t, -s), points toward the center.
        if (!has(row, col + s) || !has(row + t, col)) continue
        if (-t * (cy2 - 2 * row - t) - s * (cx2 - 2 * col - s) > 0) return 'inside'
        kind = 'outside'
      }
    }
    return kind
  }

  /** The cell and its mirror images (plus its diagonal reflections for a circle), so removals keep the symmetry. */
  const mirrors = ({ row, col }: { row: number; col: number }) => {
    const images = [
      { row, col },
      { row: cy2 - row, col },
      { row, col: cx2 - col },
      { row: cy2 - row, col: cx2 - col },
    ]
    if (isCircle) images.push(...images.map((c) => ({ row: c.col - colMin + rowMin, col: c.row - rowMin + colMin })))
    return [...new Map(images.map((c) => [`${c.row},${c.col}`, c])).values()].filter((c) => has(c.row, c.col))
  }

  const neighbors = ({ row, col }: { row: number; col: number }) => {
    const found: { row: number; col: number }[] = []
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && has(row + dr, col + dc)) found.push({ row: row + dr, col: col + dc })
    }
    return found
  }
  const rowCounts = new Map<number, number>()
  const colCounts = new Map<number, number>()
  for (const { row, col } of cells.values()) {
    rowCounts.set(row, (rowCounts.get(row) ?? 0) + 1)
    colCounts.set(col, (colCounts.get(col) ?? 0) + 1)
  }

  /** Removes one cell if the outline survives it: the cell's remaining neighbors still connect to each other
   *  (so any path through it can go around), none is left a dead end, and the shape still reaches every side
   *  of its box. Checking only the neighborhood is enough because cells are removed one at a time. */
  const tryRemove = (cell: { row: number; col: number }) => {
    if (rowCounts.get(cell.row) === 1 && (cell.row === rowMin || cell.row === rowMax)) return false
    if (colCounts.get(cell.col) === 1 && (cell.col === colMin || cell.col === colMax)) return false
    const key = `${cell.row},${cell.col}`
    live.delete(key)
    const around = neighbors(cell)
    const reached = new Set(around.slice(0, 1))
    for (let grew = true; grew; ) {
      grew = false
      for (const n of around) {
        if (reached.has(n)) continue
        if ([...reached].some((r) => Math.abs(r.row - n.row) <= 1 && Math.abs(r.col - n.col) <= 1)) {
          reached.add(n)
          grew = true
        }
      }
    }
    if (reached.size < around.length || around.some((n) => neighbors(n).length < 2)) {
      live.set(key, cell)
      return false
    }
    rowCounts.set(cell.row, rowCounts.get(cell.row)! - 1)
    colCounts.set(cell.col, colCounts.get(cell.col)! - 1)
    return true
  }

  // Inside corners go first: where one touches an outside corner (two overlapping runs), removing it also
  // resolves the outside one's L, so the outer pixel keeps the curve's edge. A corner and its mirror images
  // are removed together or not at all.
  for (const kind of ['inside', 'outside'] as const) {
    for (const cell of [...live.values()].filter((c) => cornerKind(c) === kind)) {
      if (!has(cell.row, cell.col) || cornerKind(cell) !== kind) continue
      const group = mirrors(cell)
      const done: { row: number; col: number }[] = []
      for (const c of group) {
        if (!tryRemove(c)) break
        done.push(c)
      }
      if (done.length < group.length) {
        for (const c of done) {
          live.set(`${c.row},${c.col}`, c)
          rowCounts.set(c.row, rowCounts.get(c.row)! + 1)
          colCounts.set(c.col, colCounts.get(c.col)! + 1)
        }
      }
    }
  }
  return [...live.values()]
}

/** Halves `sum` (which is either whole or lands exactly on .5), breaking .5 ties in the direction
 *  `offset` points away from the ellipse center. `Math.round` always breaks ties upward regardless of
 *  sign, which would round a mirrored pair of points (e.g. offset +2 and -2) the *same* direction and
 *  visibly break the ellipse's symmetry. */
function roundHalfAwayFromCenter(sum: number, offset: number): number {
  const half = sum / 2
  return offset >= 0 ? Math.ceil(half) : Math.floor(half)
}

/** 4-connected region of cells matching the start cell's color, for a flood fill. */
export function floodFillCells(grid: PixelGrid, startRow: number, startCol: number): { row: number; col: number }[] {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const target = grid[startRow][startCol]
  const visited = new Set<string>([`${startRow},${startCol}`])
  const cells: { row: number; col: number }[] = []
  const stack: { row: number; col: number }[] = [{ row: startRow, col: startCol }]

  while (stack.length > 0) {
    const cell = stack.pop()!
    cells.push(cell)
    const neighbors = [
      { row: cell.row - 1, col: cell.col },
      { row: cell.row + 1, col: cell.col },
      { row: cell.row, col: cell.col - 1 },
      { row: cell.row, col: cell.col + 1 },
    ]
    for (const n of neighbors) {
      if (n.row < 0 || n.row >= height || n.col < 0 || n.col >= width) continue
      const key = `${n.row},${n.col}`
      if (visited.has(key)) continue
      visited.add(key)
      const c = grid[n.row][n.col]
      if (c.r === target.r && c.g === target.g && c.b === target.b && c.a === target.a) {
        stack.push(n)
      }
    }
  }

  return cells
}

/** Rectangle outline inscribed in the bounding box between two opposite corners. */
export function rectangleCells(r0: number, c0: number, r1: number, c1: number): { row: number; col: number }[] {
  const rowMin = Math.min(r0, r1)
  const rowMax = Math.max(r0, r1)
  const colMin = Math.min(c0, c1)
  const colMax = Math.max(c0, c1)

  const cells: { row: number; col: number }[] = []
  for (let col = colMin; col <= colMax; col++) {
    cells.push({ row: rowMin, col })
    if (rowMax !== rowMin) cells.push({ row: rowMax, col })
  }
  for (let row = rowMin + 1; row < rowMax; row++) {
    cells.push({ row, col: colMin })
    if (colMax !== colMin) cells.push({ row, col: colMax })
  }
  return cells
}

export function imageDataToGrid(imageData: ImageData): PixelGrid {
  const { width, height, data } = imageData
  const grid = createGrid(width, height)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = (row * width + col) * 4
      grid[row][col] = { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] }
    }
  }
  return grid
}

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b, a: alpha }
}

export function rgbaToHex({ r, g, b }: RGBA): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Distinct non-transparent colors currently painted on the grid, most-used first. */
/** Pixel count per color, most-used first. Transparent pixels are skipped, or counted as
 *  `transparentAs` when given (e.g. the NES backdrop showing through). */
export function colorCounts(grid: PixelGrid, transparentAs?: string): { hex: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const row of grid) {
    for (const cell of row) {
      const hex = cell.a === 0 ? transparentAs : rgbaToHex(cell)
      if (hex === undefined) continue
      counts.set(hex, (counts.get(hex) ?? 0) + 1)
    }
  }
  return [...counts.entries()].map(([hex, count]) => ({ hex, count })).sort((a, b) => b.count - a.count)
}

export function usedColors(grid: PixelGrid): string[] {
  return colorCounts(grid).map(({ hex }) => hex)
}

/** Bresenham line between two cells, inclusive of both ends — keeps fast drags gap-free. */
export function cellsBetween(r0: number, c0: number, r1: number, c1: number): { row: number; col: number }[] {
  const cells: { row: number; col: number }[] = []
  let x0 = c0
  let y0 = r0
  const dx = Math.abs(c1 - c0)
  const dy = -Math.abs(r1 - r0)
  const sx = c0 < c1 ? 1 : -1
  const sy = r0 < r1 ? 1 : -1
  let err = dx + dy

  while (true) {
    cells.push({ row: y0, col: x0 })
    if (x0 === c1 && y0 === r1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }

  return cells
}

const BEZIER_SAMPLES = 64

/** Cubic Bezier curve through two anchors (p0, p3) pulled by two control points (p1, p2), rasterized
 *  by sampling at fixed resolution and connecting consecutive samples so fast curvature doesn't gap. */
export function bezierCells(
  p0: { row: number; col: number },
  p1: { row: number; col: number },
  p2: { row: number; col: number },
  p3: { row: number; col: number },
): { row: number; col: number }[] {
  const cells = new Map<string, { row: number; col: number }>()
  let previous: { row: number; col: number } | null = null

  for (let i = 0; i <= BEZIER_SAMPLES; i++) {
    const t = i / BEZIER_SAMPLES
    const mt = 1 - t
    const row = mt ** 3 * p0.row + 3 * mt ** 2 * t * p1.row + 3 * mt * t ** 2 * p2.row + t ** 3 * p3.row
    const col = mt ** 3 * p0.col + 3 * mt ** 2 * t * p1.col + 3 * mt * t ** 2 * p2.col + t ** 3 * p3.col
    const point = { row: Math.round(row), col: Math.round(col) }
    cells.set(`${point.row},${point.col}`, point)
    if (previous) {
      for (const c of cellsBetween(previous.row, previous.col, point.row, point.col)) {
        cells.set(`${c.row},${c.col}`, c)
      }
    }
    previous = point
  }

  return [...cells.values()]
}

export type DitherPattern = 'bayer' | 'lines' | 'diagonal' | 'dots'

/** Threshold matrix for a pattern: each cell's value is the rank at which it flips to the end color, and
 *  `levels` is how many distinct ranks there are (the divisor that normalizes ranks into 0..1). */
interface Threshold {
  matrix: number[][]
  levels: number
}

const thresholdCache = new Map<string, Threshold>()

/** Ordered-dither threshold matrix of side `size` (a power of two), built by B(2n) = [[4B, 4B+2], [4B+3, 4B+1]]. */
function bayerMatrix(size: number): number[][] {
  let m = [[0]]
  for (let n = 1; n < size; n *= 2) {
    const next: number[][] = Array.from({ length: n * 2 }, () => new Array<number>(n * 2).fill(0))
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        next[r][c] = 4 * m[r][c]
        next[r][c + n] = 4 * m[r][c] + 2
        next[r + n][c] = 4 * m[r][c] + 3
        next[r + n][c + n] = 4 * m[r][c] + 1
      }
    }
    m = next
  }
  return m
}

/** Reverses the low bits of `i` (for a power-of-two `size`), spreading consecutive indices as far apart as possible. */
function bitReverse(i: number, size: number): number {
  let result = 0
  for (let bit = size >> 1, src = i; bit > 0; bit >>= 1, src >>= 1) {
    if (src & 1) result |= bit
  }
  return result
}

/** Clustered-dot (halftone) matrix: cells nearest the tile's center flip first, so the end color grows as a dot. */
function dotMatrix(size: number): number[][] {
  const center = size / 2
  const order = Array.from({ length: size * size }, (_, i) => {
    const row = Math.floor(i / size)
    const col = i % size
    const dy = row + 0.5 - center
    const dx = col + 0.5 - center
    return { row, col, distance: dx * dx + dy * dy, angle: Math.atan2(dy, dx) }
  }).sort((a, b) => a.distance - b.distance || a.angle - b.angle)
  const matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0))
  order.forEach(({ row, col }, rank) => {
    matrix[row][col] = rank
  })
  return matrix
}

function thresholdFor(pattern: DitherPattern, size: number): Threshold {
  const key = `${pattern}:${size}`
  const cached = thresholdCache.get(key)
  if (cached) return cached
  let threshold: Threshold
  if (pattern === 'bayer') {
    threshold = { matrix: bayerMatrix(size), levels: size * size }
  } else if (pattern === 'dots') {
    threshold = { matrix: dotMatrix(size), levels: size * size }
  } else {
    // Lines run along one axis: the rank depends only on the row (horizontal lines) or on row + col (diagonal hatch).
    const along = (row: number, col: number) => (pattern === 'lines' ? row : row + col) % size
    const matrix = Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) => bitReverse(along(row, col), size)),
    )
    threshold = { matrix, levels: size }
  }
  thresholdCache.set(key, threshold)
  return threshold
}

/** Dithered linear gradient along the axis from (r0, c0) to (r1, c1), covering every cell in `bounds`.
 *  `useSecondary` marks cells that take the gradient's end color. The pattern is anchored to absolute
 *  cell coordinates so overlapping gradients tile consistently. */
export function gradientCells(
  r0: number,
  c0: number,
  r1: number,
  c1: number,
  pattern: DitherPattern,
  size: number,
  bounds: { rowMin: number; rowMax: number; colMin: number; colMax: number },
): { row: number; col: number; useSecondary: boolean }[] {
  const dRow = r1 - r0
  const dCol = c1 - c0
  const lengthSq = dRow * dRow + dCol * dCol
  if (lengthSq === 0) return []

  const { matrix, levels } = thresholdFor(pattern, size)
  const cells: { row: number; col: number; useSecondary: boolean }[] = []
  for (let row = bounds.rowMin; row <= bounds.rowMax; row++) {
    for (let col = bounds.colMin; col <= bounds.colMax; col++) {
      const t = Math.min(1, Math.max(0, ((row - r0) * dRow + (col - c0) * dCol) / lengthSq))
      const threshold = (matrix[row % size][col % size] + 0.5) / levels
      cells.push({ row, col, useSecondary: t > threshold })
    }
  }
  return cells
}

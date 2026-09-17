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
export const CELL_SIZE = 12

export function createGrid(width: number, height: number, fill: RGBA = TRANSPARENT): PixelGrid {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ...fill })))
}

export function cloneGrid(grid: PixelGrid): PixelGrid {
  return grid.map((row) => row.map((cell) => ({ ...cell })))
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

export function gridToImageData(grid: PixelGrid): ImageData {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const { r, g, b, a } = grid[row][col]
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
  return [...cells.values()]
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

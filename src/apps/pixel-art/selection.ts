export type Cell = { row: number; col: number }
export type Rect = { rowMin: number; rowMax: number; colMin: number; colMax: number }

/** A selection of any shape: its cells, a `row,col` lookup, and their bounding box. */
export interface Selection {
  cells: Cell[]
  keys: Set<string>
  bounds: Rect
}

/** How a new selection gesture combines with the existing selection (Shift adds, Alt subtracts). */
export type SelectMode = 'replace' | 'add' | 'subtract'

const keyOf = (row: number, col: number) => `${row},${col}`

/** Null when there are no cells, so "nothing selected" has a single representation. */
export function selectionFromCells(cells: Iterable<Cell>): Selection | null {
  const keys = new Set<string>()
  const unique: Cell[] = []
  for (const cell of cells) {
    const key = keyOf(cell.row, cell.col)
    if (keys.has(key)) continue
    keys.add(key)
    unique.push(cell)
  }
  if (unique.length === 0) return null
  const bounds = { rowMin: Infinity, rowMax: -Infinity, colMin: Infinity, colMax: -Infinity }
  for (const { row, col } of unique) {
    bounds.rowMin = Math.min(bounds.rowMin, row)
    bounds.rowMax = Math.max(bounds.rowMax, row)
    bounds.colMin = Math.min(bounds.colMin, col)
    bounds.colMax = Math.max(bounds.colMax, col)
  }
  return { cells: unique, keys, bounds }
}

export function rectCells(rect: Rect): Cell[] {
  const cells: Cell[] = []
  for (let row = rect.rowMin; row <= rect.rowMax; row++) {
    for (let col = rect.colMin; col <= rect.colMax; col++) cells.push({ row, col })
  }
  return cells
}

export function isSelected(selection: Selection, { row, col }: Cell): boolean {
  return selection.keys.has(keyOf(row, col))
}

export function combineSelection(base: Selection | null, cells: Cell[], mode: SelectMode): Selection | null {
  if (mode === 'replace' || !base) return mode === 'subtract' ? null : selectionFromCells(cells)
  if (mode === 'add') return selectionFromCells([...base.cells, ...cells])
  const removed = new Set(cells.map((c) => keyOf(c.row, c.col)))
  return selectionFromCells(base.cells.filter((c) => !removed.has(keyOf(c.row, c.col))))
}

export function translateSelection(selection: Selection, dRow: number, dCol: number): Selection {
  if (dRow === 0 && dCol === 0) return selection
  return selectionFromCells(selection.cells.map((c) => ({ row: c.row + dRow, col: c.col + dCol })))!
}

/** Keeps only the cells inside a `width` x `height` canvas. */
export function clipSelection(selection: Selection, width: number, height: number): Selection | null {
  const { rowMin, rowMax, colMin, colMax } = selection.bounds
  if (rowMin >= 0 && colMin >= 0 && rowMax < height && colMax < width) return selection
  return selectionFromCells(selection.cells.filter((c) => c.row >= 0 && c.row < height && c.col >= 0 && c.col < width))
}

/** An SVG path tracing the selection's boundary (every cell edge with an unselected cell on the other side),
 *  at `cellSize` pixels per cell. Collinear edges are merged so the dashes flow along each straight run. */
export function selectionOutline(selection: Selection, cellSize: number): string {
  const has = (row: number, col: number) => selection.keys.has(keyOf(row, col))
  // Horizontal edges keyed by the grid line they sit on, holding the columns they cover; likewise vertical.
  const horizontal = new Map<number, number[]>()
  const vertical = new Map<number, number[]>()
  const push = (map: Map<number, number[]>, line: number, at: number) => {
    const list = map.get(line)
    if (list) list.push(at)
    else map.set(line, [at])
  }
  for (const { row, col } of selection.cells) {
    if (!has(row - 1, col)) push(horizontal, row, col)
    if (!has(row + 1, col)) push(horizontal, row + 1, col)
    if (!has(row, col - 1)) push(vertical, col, row)
    if (!has(row, col + 1)) push(vertical, col + 1, row)
  }
  const parts: string[] = []
  const runs = (map: Map<number, number[]>, draw: (line: number, from: number, to: number) => string) => {
    for (const [line, list] of map) {
      list.sort((a, b) => a - b)
      let start = list[0]
      for (let i = 1; i <= list.length; i++) {
        if (i < list.length && list[i] === list[i - 1] + 1) continue
        parts.push(draw(line, start, list[i - 1] + 1))
        start = list[i]
      }
    }
  }
  runs(horizontal, (y, x0, x1) => `M${x0 * cellSize} ${y * cellSize}H${x1 * cellSize}`)
  runs(vertical, (x, y0, y1) => `M${x * cellSize} ${y0 * cellSize}V${y1 * cellSize}`)
  return parts.join('')
}

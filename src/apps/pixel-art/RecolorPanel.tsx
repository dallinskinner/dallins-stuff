import { useRef, useState } from 'react'
import { oklabToRgb, rgbToOklch } from '../image-tools/colorConversion'
import type { PixelGrid, RGBA } from './pixelGrid'
import { hexToRgba, rgbaToHex } from './pixelGrid'
import styles from './RecolorPanel.module.css'

interface Cell {
  row: number
  col: number
}

interface Session {
  cells: Cell[]
  alpha: number
  l: number
  c: number
  h: number
}

interface RecolorPanelProps {
  grid: PixelGrid
  palette: string[]
  onBeginStroke: () => void
  onPaintCells: (cells: Cell[], color: RGBA) => void
}

const MAX_CHROMA = 0.4

/** Pick a color from the artwork, then drag OKLCh sliders to recolor every pixel that had it. The
 *  affected cells are captured once at pick time, so the recolor stays reversible and doesn't merge
 *  with other pixels that happen to land on the same color mid-drag. */
export function RecolorPanel({ grid, palette, onBeginStroke, onPaintCells }: RecolorPanelProps) {
  const [session, setSession] = useState<Session | null>(null)
  const hasPushedUndo = useRef(false)

  function startSession(hex: string) {
    const target = hexToRgba(hex)
    const cells: Cell[] = []
    let alpha = 255
    grid.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell.a !== 0 && rgbaToHex(cell) === hex) {
          cells.push({ row: r, col: c })
          alpha = cell.a
        }
      }),
    )
    const { l, c, h } = rgbToOklch(target.r, target.g, target.b)
    hasPushedUndo.current = false
    setSession({ cells, alpha, l, c, h })
  }

  function update(patch: Partial<Pick<Session, 'l' | 'c' | 'h'>>) {
    if (!session) return
    const next = { ...session, ...patch }
    setSession(next)
    if (!hasPushedUndo.current) {
      onBeginStroke()
      hasPushedUndo.current = true
    }
    const rad = (next.h * Math.PI) / 180
    const { r, g, b } = oklabToRgb(next.l, next.c * Math.cos(rad), next.c * Math.sin(rad))
    onPaintCells(next.cells, { r, g, b, a: next.alpha })
  }

  if (!session) {
    return (
      <div className={styles.panel}>
        {palette.length === 0 ? (
          <p className={styles.hint}>No colors yet</p>
        ) : (
          <>
            <p className={styles.hint}>Pick a color to recolor</p>
            <div className={styles.swatches}>
              {palette.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={styles.swatch}
                  style={{ backgroundColor: hex }}
                  aria-label={hex}
                  onClick={() => startSession(hex)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <p className={styles.hint}>
        {session.cells.length} pixel{session.cells.length === 1 ? '' : 's'}
      </p>
      <label className={styles.slider}>
        L {session.l.toFixed(2)}
        <input type="range" min={0} max={1} step={0.005} value={session.l} onChange={(e) => update({ l: Number(e.target.value) })} />
      </label>
      <label className={styles.slider}>
        C {session.c.toFixed(3)}
        <input
          type="range"
          min={0}
          max={MAX_CHROMA}
          step={0.002}
          value={Math.min(session.c, MAX_CHROMA)}
          onChange={(e) => update({ c: Number(e.target.value) })}
        />
      </label>
      <label className={styles.slider}>
        H {Math.round(session.h)}°
        <input type="range" min={0} max={360} step={1} value={session.h} onChange={(e) => update({ h: Number(e.target.value) })} />
      </label>
      <button type="button" onClick={() => setSession(null)}>
        Pick another
      </button>
    </div>
  )
}

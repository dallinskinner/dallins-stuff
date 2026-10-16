import { useRef } from 'react'
import styles from './CanvasRulers.module.css'

interface CanvasRulersProps {
  width: number
  height: number
  cellSize: number
  /** When false the rulers are omitted and the canvas renders on its own. */
  enabled: boolean
  children: React.ReactNode
}

/** Candidate spacings (in cells) between numbered ticks; the smallest one that leaves room for the label wins. */
const LABEL_STEPS = [1, 2, 5, 10, 20, 50, 100, 200]
const MIN_LABEL_SPACING = 36
/** Below this cell size, a tick per cell would just smear into a solid band. */
const MIN_MINOR_TICK_CELL = 4

function labelStepFor(cellSize: number): number {
  return LABEL_STEPS.find((step) => step * cellSize >= MIN_LABEL_SPACING) ?? LABEL_STEPS[LABEL_STEPS.length - 1]
}

function labelPositions(count: number, step: number): number[] {
  const positions: number[] = []
  for (let i = 0; i < count; i += step) positions.push(i)
  return positions
}

/** Pixel rulers along the top and left of the canvas, numbered in grid cells. They zoom with it and stick to the viewport edges while it scrolls. */
export function CanvasRulers({ width, height, cellSize, enabled, children }: CanvasRulersProps) {
  const topMarkerRef = useRef<HTMLDivElement>(null)
  const leftMarkerRef = useRef<HTMLDivElement>(null)

  if (!enabled) return <>{children}</>

  const step = labelStepFor(cellSize)
  const className = cellSize >= MIN_MINOR_TICK_CELL ? styles.ruler : `${styles.ruler} ${styles.noMinorTicks}`

  // Moves the markers by writing straight to the DOM: this fires on every pointer move, which shouldn't re-render the app.
  function trackPointer(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const col = Math.floor((e.clientX - rect.left) / cellSize)
    const row = Math.floor((e.clientY - rect.top) / cellSize)
    const top = topMarkerRef.current
    const left = leftMarkerRef.current
    if (top) {
      top.hidden = col < 0 || col >= width
      top.style.setProperty('--at', `${col * cellSize}px`)
    }
    if (left) {
      left.hidden = row < 0 || row >= height
      left.style.setProperty('--at', `${row * cellSize}px`)
    }
  }

  function hideMarkers() {
    if (topMarkerRef.current) topMarkerRef.current.hidden = true
    if (leftMarkerRef.current) leftMarkerRef.current.hidden = true
  }

  return (
    <div
      className={styles.frame}
      style={
        {
          '--cell-size': `${cellSize}px`,
          '--label-step': step,
          '--display-width': `${width * cellSize}px`,
          '--display-height': `${height * cellSize}px`,
        } as React.CSSProperties
      }
    >
      <div className={styles.corner} />
      <div className={`${className} ${styles.top}`} aria-hidden="true">
        {labelPositions(width, step).map((i) => (
          <span key={i} className={styles.topLabel} style={{ '--at': `${i * cellSize}px` } as React.CSSProperties}>
            {i}
          </span>
        ))}
        <div ref={topMarkerRef} className={styles.topMarker} hidden />
      </div>
      <div className={`${className} ${styles.left}`} aria-hidden="true">
        {labelPositions(height, step).map((i) => (
          <span key={i} className={styles.leftLabel} style={{ '--at': `${i * cellSize}px` } as React.CSSProperties}>
            {i}
          </span>
        ))}
        <div ref={leftMarkerRef} className={styles.leftMarker} hidden />
      </div>
      <div className={styles.content} onPointerMove={trackPointer} onPointerLeave={hideMarkers}>
        {children}
      </div>
    </div>
  )
}

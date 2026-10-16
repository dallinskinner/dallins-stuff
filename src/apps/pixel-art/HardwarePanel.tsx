import { useState } from 'react'
import styles from './HardwarePanel.module.css'

interface HardwarePanelProps {
  title: string
  showTiles: boolean
  onShowTilesChange: (show: boolean) => void
  showRegions: boolean
  onShowRegionsChange: (show: boolean) => void
  strict: boolean
  onStrictChange: (strict: boolean) => void
  uniqueTiles: number | null
  maxUniqueTiles: number
}

/** Collapsible box of console-mode overlays, rules and the tile budget. The budget stays visible while collapsed. */
export function HardwarePanel({
  title,
  showTiles,
  onShowTilesChange,
  showRegions,
  onShowRegionsChange,
  strict,
  onStrictChange,
  uniqueTiles,
  maxUniqueTiles,
}: HardwarePanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const overBudget = uniqueTiles !== null && uniqueTiles > maxUniqueTiles
  const tileLabel = `Tiles ${uniqueTiles ?? '–'} / ${maxUniqueTiles}`

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.header} aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
        <span className={styles.title}>{title}</span>
        {collapsed && overBudget && (
          <span className={styles.tileCount} data-over="true" title={tileLabel} aria-label="Over tile budget">
            {'⚠\uFE0E'}
          </span>
        )}
        <span className={styles.chevron} aria-hidden="true">
          {/* The panel is anchored to the bottom, so it grows upward: the arrow points the way it will move. */}
          {collapsed ? '▴' : '▾'}
        </span>
      </button>
      {!collapsed && (
        <div className={styles.body}>
          <span className={styles.tileCount} data-over={overBudget}>
            {tileLabel}
          </span>
          <label>
            <input type="checkbox" checked={showTiles} onChange={(e) => onShowTilesChange(e.target.checked)} />
            Show tiles
          </label>
          <label>
            <input type="checkbox" checked={showRegions} onChange={(e) => onShowRegionsChange(e.target.checked)} />
            Palette areas
          </label>
          <label title="On: paints that would exceed the tile budget are refused. Off: you can go over it (the counter turns red).">
            <input type="checkbox" checked={strict} onChange={(e) => onStrictChange(e.target.checked)} />
            Strict
          </label>
        </div>
      )}
    </div>
  )
}

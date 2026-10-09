import { useState } from 'react'
import type { HardwareMode, ModePalette } from './modes/types'
import styles from './ConsolePalettePanel.module.css'

export interface ActiveSlot {
  sp: number
  /** 0 is the shared backdrop / transparent slot; 1+ index a subpalette's colors. */
  slot: number
}

interface ConsolePalettePanelProps {
  mode: HardwareMode
  palette: ModePalette
  active: ActiveSlot
  onSelect: (active: ActiveSlot) => void
  /** Slot (in the active subpalette) used as the gradient's end color; set by right-clicking a swatch. */
  secondarySlot: number
  onSelectSecondary: (slot: number) => void
  onEditEntry: (active: ActiveSlot, hex: string) => boolean
}

/** The console's palette RAM: pick the slot to paint with, or swap a slot's color for another from the hardware's master palette. */
export function ConsolePalettePanel({ mode, palette, active, onSelect, secondarySlot, onSelectSecondary, onEditEntry }: ConsolePalettePanelProps) {
  const [editing, setEditing] = useState(false)
  const [clash, setClash] = useState(false)
  const masterGrid = mode.masterGrid ?? [mode.masterPalette]
  const hasBackdrop = mode.slot0 === 'backdrop'
  const editable = active.slot > 0 || hasBackdrop

  function pick(hex: string) {
    setClash(!onEditEntry(active, hex))
  }

  return (
    <div className={styles.panel}>
      <div className={styles.rows}>
        {palette.subpalettes.map((entries, sp) => (
          <div key={sp} className={styles.row} data-active={sp === active.sp}>
            <button
              type="button"
              className={styles.swatch}
              style={hasBackdrop ? ({ '--color': palette.backdrop } as React.CSSProperties) : undefined}
              data-transparent={!hasBackdrop}
              aria-label={hasBackdrop ? `Palette ${sp + 1} backdrop` : `Palette ${sp + 1} transparent`}
              aria-pressed={active.sp === sp && active.slot === 0}
              data-secondary={active.sp === sp && secondarySlot === 0}
              onClick={() => onSelect({ sp, slot: 0 })}
              onContextMenu={(e) => {
                e.preventDefault()
                onSelectSecondary(0)
              }}
            />
            {entries.map((hex, i) => (
              <button
                key={i}
                type="button"
                className={styles.swatch}
                style={{ '--color': hex } as React.CSSProperties}
                aria-label={`Palette ${sp + 1} color ${i + 1}: ${hex}`}
                aria-pressed={active.sp === sp && active.slot === i + 1}
                data-secondary={active.sp === sp && secondarySlot === i + 1}
                onClick={() => onSelect({ sp, slot: i + 1 })}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onSelectSecondary(i + 1)
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <button type="button" disabled={!editable} aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
        {editing ? 'Done' : 'Edit color'}
      </button>
      {editing && (
        <>
          <p className={styles.hint}>
            {clash ? 'Already used in this palette' : active.slot === 0 ? 'Pick the backdrop' : 'Pick the new color'}
          </p>
          <div className={styles.master} style={{ '--cols': masterGrid[0].length } as React.CSSProperties}>
            {masterGrid.flat().map((hex, i) =>
              hex === null ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  className={styles.masterSwatch}
                  style={{ '--color': hex } as React.CSSProperties}
                  aria-label={hex}
                  onClick={() => pick(hex)}
                />
              ),
            )}
          </div>
        </>
      )}
    </div>
  )
}

import { useState } from 'react'
import { oklabToRgb, rgbToHex, rgbToOklch } from '../image-tools/colorConversion'
import styles from './ColorPaletteApp.module.css'

interface PaletteColor {
  id: number
  /** Lightness, 0-1. */
  l: number
  /** Chroma, 0-MAX_CHROMA. */
  c: number
  /** Hue, degrees. */
  h: number
  /** Share of the canvas, 0-100. Shares are normalized, so they needn't sum to 100. */
  percent: number
}

const MAX_CHROMA = 0.4
const MAX_COLORS = 12

function oklchToHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180
  const { r, g, b } = oklabToRgb(l, c * Math.cos(rad), c * Math.sin(rad))
  return rgbToHex(r, g, b)
}

function hexToOklch(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return rgbToOklch((n >> 16) & 255, (n >> 8) & 255, n & 255)
}

/** Whole-number shares of 100 (largest-remainder rounding, so they always sum to exactly 100). */
function wholeShares(percents: number[]): number[] {
  const total = percents.reduce((sum, p) => sum + p, 0)
  if (total <= 0) return percents.map(() => 0)
  const exact = percents.map((p) => (p / total) * 100)
  const shares = exact.map(Math.floor)
  const byRemainder = exact.map((_, i) => i).sort((a, b) => (exact[b] - shares[b]) - (exact[a] - shares[a]))
  const leftover = 100 - shares.reduce((sum, n) => sum + n, 0)
  for (let k = 0; k < leftover; k++) shares[byRemainder[k]]++
  return shares
}

function cssColor({ l, c, h }: PaletteColor): string {
  return `oklch(${l} ${c} ${h})`
}

let nextId = 1
function makeColor(): PaletteColor {
  return {
    id: nextId++,
    l: 0.4 + Math.random() * 0.5,
    c: 0.04 + Math.random() * 0.16,
    h: Math.random() * 360,
    percent: 25,
  }
}

export function ColorPaletteApp() {
  const [colors, setColors] = useState<PaletteColor[]>(() => [makeColor()])

  const total = colors.reduce((sum, color) => sum + color.percent, 0)
  const shares = wholeShares(colors.map((color) => color.percent))

  const update = (id: number, patch: Partial<PaletteColor>) =>
    setColors((prev) => prev.map((color) => (color.id === id ? { ...color, ...patch } : color)))

  const addColor = () => setColors((prev) => [...prev, makeColor()])
  const removeColor = (id: number) => setColors((prev) => prev.filter((color) => color.id !== id))

  return (
    <div className={styles.app}>
      <div className={styles.actions}>
        <button onClick={addColor} disabled={colors.length >= MAX_COLORS}>
          Add color
        </button>
        <span className={styles.total}>Total: {Math.round(total)}%</span>
      </div>

      <div className={styles.workspace}>
        <div className={styles.canvas}>
          {colors.length === 0 && <p className={styles.empty}>Add a color to get started.</p>}
          {colors.map((color) => (
            <div
              key={color.id}
              className={styles.swatch}
              style={{ '--color': cssColor(color), '--share': total > 0 ? color.percent : 0 } as React.CSSProperties}
              title={oklchToHex(color.l, color.c, color.h)}
            />
          ))}
        </div>

        <div className={styles.controls}>
          {colors.map((color, i) => (
            <div key={color.id} className={styles.colorRow}>
              <div className={styles.rowHeader}>
                <label className={styles.chip} style={{ '--color': cssColor(color) } as React.CSSProperties}>
                  <input
                    type="color"
                    className={styles.chipInput}
                    value={oklchToHex(color.l, color.c, color.h)}
                    onChange={(e) => update(color.id, hexToOklch(e.target.value))}
                    aria-label={`Pick color ${i + 1}`}
                  />
                </label>
                <code>{oklchToHex(color.l, color.c, color.h)}</code>
                <button
                  className={styles.remove}
                  onClick={() => removeColor(color.id)}
                                    aria-label={`Remove color ${i + 1}`}
                >
                  ×
                </button>
              </div>
              <Slider label="Hue" value={color.h} min={0} max={360} step={1} onChange={(h) => update(color.id, { h })} />
              <Slider
                label="Lightness"
                value={color.l}
                min={0}
                max={1}
                step={0.01}
                onChange={(l) => update(color.id, { l })}
              />
              <Slider
                label="Chroma"
                value={color.c}
                min={0}
                max={MAX_CHROMA}
                step={0.005}
                onChange={(c) => update(color.id, { c })}
              />
              <Slider
                label="Percent"
                value={color.percent}
                min={0}
                max={100}
                step={1}
                onChange={(percent) => update(color.id, { percent })}
                display={`${shares[i]}%`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** Readout text; defaults to the raw value. */
  display?: string
}

function Slider({ label, value, min, max, step, onChange, display }: SliderProps) {
  return (
    <label className={styles.slider}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output className={styles.readout}>{display ?? String(Number(value.toFixed(3)))}</output>
    </label>
  )
}

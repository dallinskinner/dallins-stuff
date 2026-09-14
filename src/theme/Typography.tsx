import { useEffect } from 'react'
import { useDialKit } from 'dialkit'

export function Typography() {
  const values = useDialKit('Typography', {
    scale: {
      base: [16, 12, 22, 1],
      ratio: [1.25, 1.05, 1.75, 0.005],
    },
    baseline: {
      unit: [8, 4, 16, 1],
    },
    heading: {
      weight: [700, 400, 900, 10],
      heroScale: [2.0, 1.2, 3, 0.05],
      lineHeight: {
        tight: [1.1, 1, 1.3, 0.01],
        loose: [1.3, 1.1, 1.6, 0.01],
      },
      letterSpacing: {
        tight: [-0.02, -0.05, 0.02, 0.001],
        loose: [0.01, -0.02, 0.05, 0.001],
      },
    },
    body: {
      weight: [400, 300, 700, 10],
      lineHeight: [1.5, 1.2, 2.2, 0.01],
      letterSpacing: [0, -0.02, 0.05, 0.001],
      maxWidth: [65, 45, 90, 1],
    },
    code: {
      size: [0.9, 0.7, 1.05, 0.01],
    },
    lead: {
      lineHeight: [1.4, 1.2, 2, 0.01],
    },
    paragraphSpacing: [1, 0.4, 2.5, 0.05],
  }, { defaultCollapsed: true })

  useEffect(() => {
    const { scale, baseline, heading, body, code, lead, paragraphSpacing } = values
    const step = (n: number) => scale.base * Math.pow(scale.ratio, n)
    const unit = baseline.unit

    // Spacing between blocks is a real alignment problem — it sits next to
    // icons, borders, and other spacing values that share the grid. A gap
    // can be tighter than the grid suggests without clipping anything, so
    // there's no floor here (unlike a line-height, which must fit its text).
    const snapSpace = (px: number) => Math.max(unit, Math.round(px / unit) * unit)

    // Optical sizing: bigger type wants tighter relative leading and tracking,
    // smaller type wants looser. Interpolate linearly by actual font size
    // between h1 (tight) and h6, which is also body's size (loose) — a
    // curve, not a single flat number applied at every heading level.
    const h1Size = step(5)
    const h6Size = step(0)
    const curveAt = (fontSize: number, tight: number, loose: number) => {
      const t = (fontSize - h6Size) / (h1Size - h6Size)
      return loose + (tight - loose) * t
    }

    const root = document.documentElement.style
    const levels: [string, number][] = [
      ['h1', h1Size],
      ['h2', step(4)],
      ['h3', step(3)],
      ['h4', step(2)],
      ['h5', step(1)],
      ['h6', h6Size],
    ]
    for (const [level, size] of levels) {
      root.setProperty(`--fs-${level}`, `${size}px`)
      root.setProperty(`--lh-${level}`, `${curveAt(size, heading.lineHeight.tight, heading.lineHeight.loose)}`)
      root.setProperty(`--ls-${level}`, `${curveAt(size, heading.letterSpacing.tight, heading.letterSpacing.loose)}em`)
    }

    const heroSize = h1Size * heading.heroScale
    root.setProperty('--fs-hero', `${heroSize}px`)
    root.setProperty('--lh-hero', `${curveAt(heroSize, heading.lineHeight.tight, heading.lineHeight.loose)}`)
    root.setProperty('--ls-hero', `${curveAt(heroSize, heading.letterSpacing.tight, heading.letterSpacing.loose)}em`)

    root.setProperty('--fs-body', `${scale.base}px`)
    root.setProperty('--fs-small', `${step(-1)}px`)
    root.setProperty('--fs-lead', `${step(1.5)}px`)
    root.setProperty('--lh-lead', `${lead.lineHeight}`)
    root.setProperty('--fs-code', `${code.size}em`)

    // Body's line-height stays a plain, unitless ratio — a single line of
    // text has no neighboring column or component to stay aligned with, so
    // there's nothing here for the grid to protect, and no size range to
    // curve across.
    root.setProperty('--fw-heading', `${heading.weight}`)
    root.setProperty('--fw-body', `${body.weight}`)
    root.setProperty('--lh-body', `${body.lineHeight}`)
    root.setProperty('--ls-body', `${body.letterSpacing}em`)
    root.setProperty('--body-max-width', `${body.maxWidth}ch`)

    root.setProperty('--baseline-unit', `${unit}px`)
    root.setProperty('--paragraph-spacing', `${snapSpace(scale.base * paragraphSpacing)}px`)
    root.setProperty('--heading-spacing', `${snapSpace(scale.base * paragraphSpacing * 0.5)}px`)
  }, [values])

  return null
}

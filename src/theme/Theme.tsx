import { useEffect } from 'react'
import { DialRoot, useDialKit } from 'dialkit'
import 'dialkit/styles.css'

export function Theme() {
  const values = useDialKit('Theme', {
    background: '#0e0e0e',
    foreground: '#e6e6e6',
    border: '#333333c2',
    accent: '#5b8def',
    radius: [8, 0, 32],
    padding: [12, 0, 40],
    contentBackground: '#191919',
  })

  useEffect(() => {
    for (const [key, value] of Object.entries(values)) {
      const cssValue = typeof value === 'number' ? `${value}px` : `${value}`
      const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      document.documentElement.style.setProperty(`--${cssVar}`, cssValue)
    }
  }, [values])

  return <DialRoot />
}

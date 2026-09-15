import { useEffect } from 'react'
import { useDialKit } from 'dialkit'

export function WindowChrome() {
  const values = useDialKit('Window', {
    title: {
      mono: [50, 0, 100, 1],
      weight: [550, 400, 700, 10],
    },
  })

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--window-title-mono', `${values.title.mono}`)
    root.setProperty('--window-title-weight', `${values.title.weight}`)
  }, [values])

  return null
}

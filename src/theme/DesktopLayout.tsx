import { useEffect } from 'react'
import { useDialKit } from 'dialkit'

export function DesktopLayout() {
  const values = useDialKit('Desktop', {
    iconGap: [16, 0, 64, 1],
    iconInset: [24, 0, 96, 1],
  }, { defaultCollapsed: true })

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--icon-gap', `${values.iconGap}px`)
    root.setProperty('--icon-inset', `${values.iconInset}px`)
  }, [values])

  return null
}

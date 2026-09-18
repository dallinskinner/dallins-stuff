import { useEffect } from 'react'
import { useDialKit } from 'dialkit'

export function DesktopLayout() {
  const values = useDialKit('Desktop', {
    iconGap: [8, 0, 64, 1],
    iconInset: [24, 0, 96, 1],
    iconCellSize: [80, 48, 160, 4],
    iconFontSize: [14, 8, 20, 1],
  }, { defaultCollapsed: true })

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--icon-gap', `${values.iconGap}px`)
    root.setProperty('--icon-inset', `${values.iconInset}px`)
    root.setProperty('--icon-cell-size', `${values.iconCellSize}px`)
    root.setProperty('--icon-font-size', `${values.iconFontSize}px`)
  }, [values])

  return null
}

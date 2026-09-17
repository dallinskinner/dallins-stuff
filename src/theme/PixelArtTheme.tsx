import { useEffect } from 'react'
import { useDialKit } from 'dialkit'

export function PixelArtTheme() {
  const values = useDialKit('Pixel Art', {
    gridColor: '#444444',
  }, { defaultCollapsed: true })

  useEffect(() => {
    document.documentElement.style.setProperty('--pixel-grid-color', values.gridColor)
  }, [values])

  return null
}

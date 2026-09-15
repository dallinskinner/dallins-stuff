import { useRef } from 'react'
import { hoverColors } from './hoverColors'

export function useHoverColor() {
  const lastIndex = useRef(-1)

  function onPointerEnter(e: React.PointerEvent<HTMLElement>) {
    let index = Math.floor(Math.random() * hoverColors.length)
    if (hoverColors.length > 1 && index === lastIndex.current) {
      index = (index + 1) % hoverColors.length
    }
    lastIndex.current = index
    e.currentTarget.style.setProperty('--hover-color', hoverColors[index])
  }

  return { onPointerEnter }
}

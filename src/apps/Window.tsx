import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './Window.module.css'

interface WindowProps {
  title: string
  children: React.ReactNode
}

export function Window({ title, children }: WindowProps) {
  const windowRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setIsDragging(true)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging || !windowRef.current) return
    windowRef.current.style.setProperty('--x', `${e.clientX - dragOffset.current.x}px`)
    windowRef.current.style.setProperty('--y', `${e.clientY - dragOffset.current.y}px`)
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsDragging(false)
    setPos({
      x: e.clientX - dragOffset.current.x,
      y: e.clientY - dragOffset.current.y,
    })
  }

  return (
    <div
      ref={windowRef}
      className={isDragging ? `${styles.window} ${styles.dragging}` : styles.window}
      style={{ '--x': `${pos.x}px`, '--y': `${pos.y}px` } as React.CSSProperties}
    >
      <div
        className={isDragging ? `${styles.titleBar} ${styles.dragging}` : styles.titleBar}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span className={styles.title}>{title}</span>
        <Link to="/" className={styles.close} onPointerDown={(e) => e.stopPropagation()}>
          ✕
        </Link>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  )
}

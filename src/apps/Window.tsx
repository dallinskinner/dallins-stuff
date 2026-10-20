import { useRef, useState } from 'react'
import { useHoverColor } from '../theme/useHoverColor'
import styles from './Window.module.css'
import closeIcon from '../assets/icons/close.png'

interface WindowProps {
  title: string
  /** Mask-style icon shown before the title. */
  icon?: string
  maxWidth?: number | string
  zIndex: number
  isFocused: boolean
  /** Starting offset (px, both axes) from center, so new windows cascade rather than stack exactly. */
  initialOffset?: number
  onFocus: () => void
  onClose: () => void
  children: React.ReactNode
}

const MIN_WIDTH = 400
const MIN_HEIGHT = 200
const VIEWPORT_MARGIN = 40

export function Window({ title, icon, maxWidth, zIndex, isFocused, initialOffset = 0, onFocus, onClose, children }: WindowProps) {
  const windowRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })
  const [pos, setPos] = useState({ x: initialOffset, y: initialOffset })
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const { onPointerEnter: onCloseHoverEnter } = useHoverColor()

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

  // Growing/shrinking the window changes what its centering transform's -50% resolves against, so the
  // resize math also nudges --x/--y by half the size delta to keep the top-left corner stationary —
  // otherwise the box would grow from its center and the handle would drift away from the cursor.
  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !windowRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = windowRef.current.getBoundingClientRect()
    resizeStart.current = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height, posX: pos.x, posY: pos.y }
    // Drop the CSS max-width (driven by --window-max-width) up front — otherwise it still clamps the
    // element during this very first drag, since the inline maxWidth:'none' override below only lands
    // once `size` state exists, which isn't until this drag's pointerup.
    windowRef.current.style.maxWidth = 'none'
    setIsResizing(true)
  }

  function handleResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isResizing || !windowRef.current) return
    const start = resizeStart.current
    const maxWidthPx = window.innerWidth - VIEWPORT_MARGIN
    const maxHeightPx = window.innerHeight - VIEWPORT_MARGIN
    const nextWidth = Math.min(Math.max(start.width + (e.clientX - start.x), MIN_WIDTH), maxWidthPx)
    const nextHeight = Math.min(Math.max(start.height + (e.clientY - start.y), MIN_HEIGHT), maxHeightPx)
    const nextX = start.posX + (nextWidth - start.width) / 2
    const nextY = start.posY + (nextHeight - start.height) / 2
    windowRef.current.style.width = `${nextWidth}px`
    windowRef.current.style.height = `${nextHeight}px`
    windowRef.current.style.setProperty('--x', `${nextX}px`)
    windowRef.current.style.setProperty('--y', `${nextY}px`)
  }

  function handleResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isResizing || !windowRef.current) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsResizing(false)
    const rect = windowRef.current.getBoundingClientRect()
    setSize({ width: rect.width, height: rect.height })
    const style = windowRef.current.style
    setPos({
      x: parseFloat(style.getPropertyValue('--x')) || 0,
      y: parseFloat(style.getPropertyValue('--y')) || 0,
    })
  }

  return (
    <div
      ref={windowRef}
      className={[styles.window, isFocused && styles.focused, (isDragging || isResizing) && styles.dragging]
        .filter(Boolean)
        .join(' ')}
      onPointerDownCapture={onFocus}
      style={
        {
          '--z': zIndex,
          '--x': `${pos.x}px`,
          '--y': `${pos.y}px`,
          ...(maxWidth ? { '--window-max-width': typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth } : {}),
          ...(size ? { width: `${size.width}px`, height: `${size.height}px`, maxWidth: 'none' } : {}),
        } as React.CSSProperties
      }
    >
      <div
        className={isDragging ? `${styles.titleBar} ${styles.dragging}` : styles.titleBar}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        {icon && (
          <span
            className={styles.icon}
            style={{ '--icon': `url(${icon})` } as React.CSSProperties}
            aria-hidden="true"
          />
        )}
        <span className={styles.title}>{title}</span>
        <button
          type="button"
          onClick={onClose}
          className={styles.close}
          style={{ '--icon': `url(${closeIcon})` } as React.CSSProperties}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={onCloseHoverEnter}
          aria-label="Close"
        />
      </div>
      <div className={styles.content}>{children}</div>
      <div
        className={styles.resizeHandle}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        aria-hidden="true"
      />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
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
/** How much of the window must stay on screen, horizontally, when dragged past a side edge. */
const GRAB_WIDTH = 96
/** Title bar height, so the bar can't be dragged below the bottom edge (or above the top). */
const TITLE_BAR_HEIGHT = 40

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/** Converts a window's on-screen top-left into the --x/--y offsets from its centered position. */
function offsetFor(left: number, top: number, width: number, height: number) {
  return { x: left + width / 2 - window.innerWidth / 2, y: top + height / 2 - window.innerHeight / 2 }
}

export function Window({ title, icon, maxWidth, zIndex, isFocused, initialOffset = 0, onFocus, onClose, children }: WindowProps) {
  const windowRef = useRef<HTMLDivElement>(null)
  const dragOffset = useRef({ x: 0, y: 0 })
  const dragSize = useRef({ width: 0, height: 0 })
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 })
  const [pos, setPos] = useState({ x: initialOffset, y: initialOffset })
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const { onPointerEnter: onCloseHoverEnter } = useHoverColor()

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || isMaximized || !windowRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = windowRef.current.getBoundingClientRect()
    dragSize.current = { width: rect.width, height: rect.height }
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setIsDragging(true)
  }

  /** Where the drag puts the window, kept so the title bar can't be lost off-screen. */
  function draggedPosition(e: React.PointerEvent<HTMLDivElement>) {
    const { width, height } = dragSize.current
    const x = e.clientX - dragOffset.current.x
    const y = e.clientY - dragOffset.current.y
    const left = clamp(window.innerWidth / 2 + x - width / 2, GRAB_WIDTH - width, window.innerWidth - GRAB_WIDTH)
    const top = clamp(window.innerHeight / 2 + y - height / 2, 0, window.innerHeight - TITLE_BAR_HEIGHT)
    return offsetFor(left, top, width, height)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging || !windowRef.current) return
    const next = draggedPosition(e)
    windowRef.current.style.setProperty('--x', `${next.x}px`)
    windowRef.current.style.setProperty('--y', `${next.y}px`)
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    setIsDragging(false)
    setPos(draggedPosition(e))
  }

  // When the browser shrinks, pulls the window back fully into view (shrinking it if it no longer fits).
  useEffect(() => {
    if (isMaximized) return
    function refit() {
      const el = windowRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.min(rect.width, window.innerWidth)
      const height = Math.min(rect.height, window.innerHeight)
      if (width < rect.width || height < rect.height) setSize({ width, height })
      const left = clamp(rect.left, 0, window.innerWidth - width)
      const top = clamp(rect.top, 0, window.innerHeight - height)
      const next = offsetFor(left, top, width, height)
      setPos((prev) => (Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5 ? prev : next))
    }
    window.addEventListener('resize', refit)
    return () => window.removeEventListener('resize', refit)
  }, [isMaximized])

  // Growing/shrinking the window changes what its centering transform's -50% resolves against, so the
  // resize math also nudges --x/--y by half the size delta to keep the top-left corner stationary —
  // otherwise the box would grow from its center and the handle would drift away from the cursor.
  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || isMaximized || !windowRef.current) return
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
    // The top-left corner stays put, so the window can grow only as far as the bottom-right of the viewport.
    const maxWidthPx = window.innerWidth - (start.posX + window.innerWidth / 2 - start.width / 2)
    const maxHeightPx = window.innerHeight - (start.posY + window.innerHeight / 2 - start.height / 2)
    const nextWidth = clamp(start.width + (e.clientX - start.x), MIN_WIDTH, maxWidthPx)
    const nextHeight = clamp(start.height + (e.clientY - start.y), MIN_HEIGHT, maxHeightPx)
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
      className={[styles.window, isFocused && styles.focused, (isDragging || isResizing) && styles.dragging, isMaximized && styles.maximized]
        .filter(Boolean)
        .join(' ')}
      onPointerDownCapture={onFocus}
      style={
        {
          '--z': zIndex,
          '--x': `${pos.x}px`,
          '--y': `${pos.y}px`,
          ...(maxWidth ? { '--window-max-width': typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth } : {}),
          ...(size && !isMaximized ? { width: `${size.width}px`, height: `${size.height}px`, maxWidth: 'none' } : {}),
        } as React.CSSProperties
      }
    >
      <div
        className={isDragging ? `${styles.titleBar} ${styles.dragging}` : styles.titleBar}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
        onDoubleClick={() => setIsMaximized((m) => !m)}
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
      {!isMaximized && <div
        className={styles.resizeHandle}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
        aria-hidden="true"
      />}
    </div>
  )
}

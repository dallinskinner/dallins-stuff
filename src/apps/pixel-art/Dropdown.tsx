import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Dropdown.module.css'

interface DropdownProps {
  label: string
  children: React.ReactNode
  /** 'menu' styles children as a list of items and closes after one is clicked; 'panel' is a free-form popover that stays open. */
  variant?: 'menu' | 'panel'
  align?: 'left' | 'right'
  fullWidth?: boolean
  disabled?: boolean
  /** Shows this icon (a mask-style image URL) instead of the label, as a square icon button; `label` then names it for screen readers. */
  icon?: string
  /** Renders the popover on the page itself, positioned over everything, so a scrolling or clipping container can't cut it off. It flips above the button when there's no room below. */
  floating?: boolean
}

/** A button that toggles a popover below it, closing on any pointerdown outside. */
export function Dropdown({ label, children, variant = 'menu', align = 'left', fullWidth = false, disabled = false, icon, floating = false }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  // A floating popover is placed from the button's position, so scrolling or resizing just closes it.
  useEffect(() => {
    if (!open || !floating) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, floating])

  // Measured before paint, so it never shows in the wrong place first.
  useLayoutEffect(() => {
    if (!open || !floating) return
    const trigger = triggerRef.current
    const popover = popoverRef.current
    if (!trigger || !popover) return
    const anchor = trigger.getBoundingClientRect()
    const size = popover.getBoundingClientRect()
    const margin = 8
    const below = anchor.bottom + 4
    const top = below + size.height > window.innerHeight - margin ? Math.max(margin, anchor.top - 4 - size.height) : below
    const left = align === 'right' ? anchor.right - size.width : anchor.left
    popover.style.top = `${top}px`
    popover.style.left = `${Math.max(margin, Math.min(left, window.innerWidth - size.width - margin))}px`
  }, [open, floating, align])

  function handleMenuClick(e: React.MouseEvent) {
    if (variant === 'menu' && (e.target as Element).closest('button')) setOpen(false)
  }

  const popover =
    open && !disabled ? (
      <div ref={popoverRef} className={styles.popover} data-variant={variant} data-align={align} data-floating={floating ? '' : undefined} onClick={handleMenuClick}>
        {children}
      </div>
    ) : null

  return (
    <div className={styles.dropdown} data-full-width={fullWidth} ref={ref}>
      {icon ? (
        <button
          type="button"
          ref={triggerRef}
          className={styles.trigger}
          data-size="icon"
          aria-label={label}
          title={label}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="ui-icon" style={{ '--icon': `url(${icon})` } as React.CSSProperties} />
        </button>
      ) : (
        <button type="button" ref={triggerRef} className={styles.trigger} data-chevron aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
          {label}
        </button>
      )}
      {popover && (floating ? createPortal(popover, document.body) : popover)}
    </div>
  )
}

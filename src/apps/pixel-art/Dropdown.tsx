import { useEffect, useRef, useState } from 'react'
import styles from './Dropdown.module.css'

interface DropdownProps {
  label: string
  children: React.ReactNode
  /** 'menu' styles children as a list of items and closes after one is clicked; 'panel' is a free-form popover that stays open. */
  variant?: 'menu' | 'panel'
  align?: 'left' | 'right'
  fullWidth?: boolean
  disabled?: boolean
}

/** A button that toggles a popover below it, closing on any pointerdown outside. */
export function Dropdown({ label, children, variant = 'menu', align = 'left', fullWidth = false, disabled = false }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  function handleMenuClick(e: React.MouseEvent) {
    if (variant === 'menu' && (e.target as Element).closest('button')) setOpen(false)
  }

  return (
    <div className={styles.dropdown} data-full-width={fullWidth} ref={ref}>
      <button type="button" className={styles.trigger} aria-expanded={open} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {label} ▾
      </button>
      {open && !disabled && (
        <div className={styles.popover} data-variant={variant} data-align={align} onClick={handleMenuClick}>
          {children}
        </div>
      )}
    </div>
  )
}

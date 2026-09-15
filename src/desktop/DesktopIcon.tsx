import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useHoverColor } from '../theme/useHoverColor'
import { hoverColors } from '../theme/hoverColors'
import styles from './DesktopIcon.module.css'
import folderIcon from '../assets/icons/folder-alt.png'
import folderOpenIcon from '../assets/icons/folder-alt-open.png'

interface DesktopIconProps {
  to: string
  label: string
  icon?: string
}

export function DesktopIcon({ to, label, icon }: DesktopIconProps) {
  const { onPointerEnter } = useHoverColor()
  const [isHovered, setIsHovered] = useState(false)
  const { pathname } = useLocation()
  const isOpen = pathname === to
  const linkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const el = linkRef.current
    if (!isOpen || !el || el.style.getPropertyValue('--active-color')) return
    const color = hoverColors[Math.floor(Math.random() * hoverColors.length)]
    el.style.setProperty('--active-color', color)
  }, [isOpen])

  const image = icon ?? (isHovered || isOpen ? folderOpenIcon : folderIcon)

  return (
    <Link
      ref={linkRef}
      to={to}
      className={isOpen ? `${styles.icon} ${styles.open}` : styles.icon}
      onPointerEnter={(e) => {
        onPointerEnter(e)
        setIsHovered(true)
      }}
      onPointerLeave={() => setIsHovered(false)}
      onClick={(e) => {
        const hoverColor = e.currentTarget.style.getPropertyValue('--hover-color')
        if (hoverColor) {
          e.currentTarget.style.setProperty('--active-color', hoverColor)
        }
      }}
    >
      <div className={styles.image} style={{ '--icon': `url(${image})` } as React.CSSProperties} />
      <div className={styles.label}>{label}</div>
    </Link>
  )
}

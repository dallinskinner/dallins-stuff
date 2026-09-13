import { Link } from 'react-router-dom'
import styles from './DesktopIcon.module.css'

interface DesktopIconProps {
  to: string
  label: string
}

export function DesktopIcon({ to, label }: DesktopIconProps) {
  return (
    <Link to={to} className={styles.icon}>
      <div>{label}</div>
    </Link>
  )
}

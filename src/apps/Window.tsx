import { Link } from 'react-router-dom'
import styles from './Window.module.css'

interface WindowProps {
  title: string
  children: React.ReactNode
}

export function Window({ title, children }: WindowProps) {
  return (
    <div className={styles.window}>
      <div className={styles.titleBar}>
        <span className={styles.title}>{title}</span>
        <Link to="/" className={styles.close}>
          ✕
        </Link>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  )
}

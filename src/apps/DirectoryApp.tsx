import type { AppDefinition } from './registry'
import { DesktopIcon } from '../desktop/DesktopIcon'
import styles from './DirectoryApp.module.css'

interface DirectoryAppProps {
  entries: AppDefinition[]
  basePath: string
}

export function DirectoryApp({ entries, basePath }: DirectoryAppProps) {
  if (entries.length === 0) {
    return <p className={styles.empty}>This directory is empty.</p>
  }

  return (
    <div className={styles.icons}>
      {entries.map((entry) => (
        <DesktopIcon key={entry.id} to={`${basePath}/${entry.id}`} label={entry.label} icon={entry.icon} />
      ))}
    </div>
  )
}

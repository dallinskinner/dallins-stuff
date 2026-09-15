import { Outlet } from 'react-router-dom'
import { apps } from '../apps/registry'
import { DesktopIcon } from './DesktopIcon'
import styles from './Desktop.module.css'

export function Desktop() {
  return (
    <div className={styles.desktop}>
      <div className={styles.icons}>
        {apps.map((app) => (
          <DesktopIcon key={app.id} to={`/apps/${app.id}`} label={app.label} icon={app.icon} />
        ))}
      </div>
      <Outlet />
    </div>
  )
}

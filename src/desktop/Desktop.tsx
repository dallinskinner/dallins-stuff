import { useCallback, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apps, appsAccepting, resolvePath } from '../apps/registry'
import type { AppMessage } from '../apps/messages'
import { AppWindow } from '../apps/AppWindow'
import { DesktopIcon } from './DesktopIcon'
import { WindowContext, WindowManagerContext } from './WindowManager'
import type { Delivery } from './WindowManager'
import styles from './Desktop.module.css'

const APPS_PREFIX = '/apps/'

export function Desktop() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // Windows render in open order (so React never moves or remounts one); stacking comes from zOrder,
  // whose last entry is on top.
  const [openPaths, setOpenPaths] = useState<string[]>([])
  const [zOrder, setZOrder] = useState<string[]>([])

  const splat = pathname.startsWith(APPS_PREFIX) ? pathname.slice(APPS_PREFIX.length) : null
  const resolved = splat !== null ? resolvePath(splat) : undefined
  const focusedPath = resolved?.path ?? null

  // The URL names the focused window: whenever it changes, open that window if needed and raise it to
  // the top. Done during render (rather than in an effect) so a newly opened window appears immediately.
  const [syncedPath, setSyncedPath] = useState<string | null>(null)
  if (focusedPath !== syncedPath) {
    setSyncedPath(focusedPath)
    if (focusedPath !== null) {
      setOpenPaths((prev) => (prev.includes(focusedPath) ? prev : [...prev, focusedPath]))
      setZOrder((prev) => [...prev.filter((p) => p !== focusedPath), focusedPath])
    }
  }

  const focus = useCallback(
    (path: string) => {
      if (path !== focusedPath) navigate(`${APPS_PREFIX}${path}`, { replace: true })
    },
    [focusedPath, navigate],
  )

  const close = useCallback(
    (path: string) => {
      const remaining = zOrder.filter((p) => p !== path)
      setOpenPaths((prev) => prev.filter((p) => p !== path))
      setZOrder(remaining)
      if (path === focusedPath) {
        const next = remaining.at(-1)
        navigate(next ? `${APPS_PREFIX}${next}` : '/', { replace: true })
      }
    },
    [zOrder, focusedPath, navigate],
  )

  // Messages between apps wait here until the recipient's window mounts and acknowledges them.
  const [inbox, setInbox] = useState<Record<string, Delivery[]>>({})
  const nextDeliveryId = useRef(1)

  const send = useCallback(
    (from: string, to: string, message: AppMessage) => {
      const delivery = { id: nextDeliveryId.current++, from, message }
      setInbox((prev) => ({ ...prev, [to]: [...(prev[to] ?? []), delivery] }))
      navigate(`${APPS_PREFIX}${to}`)
    },
    [navigate],
  )

  const acknowledge = useCallback((path: string, ids: number[]) => {
    setInbox((prev) => {
      const { [path]: deliveries = [], ...rest } = prev
      const remaining = deliveries.filter((d) => !ids.includes(d.id))
      return remaining.length > 0 ? { ...rest, [path]: remaining } : rest
    })
  }, [])

  const manager = useMemo(
    () => ({ openPaths, focusedPath, focus, close, send, inbox, acknowledge, targetsFor: appsAccepting }),
    [openPaths, focusedPath, focus, close, send, inbox, acknowledge],
  )

  return (
    <WindowManagerContext.Provider value={manager}>
      <div className={styles.desktop}>
        <div className={styles.icons}>
          {apps.map((app) => (
            <DesktopIcon key={app.id} to={`/apps/${app.id}`} label={app.label} icon={app.icon} />
          ))}
        </div>
        {openPaths.map((path, i) => (
          <WindowContext.Provider key={path} value={{ path, isFocused: path === focusedPath }}>
            <AppWindow path={path} zIndex={zOrder.indexOf(path) + 1} cascadeIndex={i} />
          </WindowContext.Provider>
        ))}
        {splat !== null && !resolved && <div>No app found for "{splat}"</div>}
      </div>
    </WindowManagerContext.Provider>
  )
}

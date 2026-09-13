import { useParams } from 'react-router-dom'
import { getApp } from './registry'

export function AppWindow() {
  const { appId } = useParams<{ appId: string }>()
  const app = getApp(appId)

  if (!app) {
    return <div>No app found for "{appId}"</div>
  }

  const Component = app.component
  return <Component />
}

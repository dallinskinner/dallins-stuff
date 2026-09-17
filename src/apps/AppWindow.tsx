import { useParams } from 'react-router-dom'
import { resolvePath } from './registry'
import { Window } from './Window'
import { DirectoryApp } from './DirectoryApp'

export function AppWindow() {
  const { '*': splat } = useParams()
  const resolved = resolvePath(splat ?? '')

  if (!resolved) {
    return <div>No app found for "{splat}"</div>
  }

  const { node, path } = resolved

  return (
    <Window title={node.label} maxWidth={node.windowMaxWidth}>
      {node.children ? (
        <DirectoryApp entries={node.children} basePath={`/apps/${path}`} />
      ) : node.component ? (
        <node.component />
      ) : null}
    </Window>
  )
}

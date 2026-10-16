import { resolvePath } from './registry'
import { Window } from './Window'
import { DirectoryApp } from './DirectoryApp'
import { useWindowFocus, useWindowManager } from '../desktop/WindowManager'

interface AppWindowProps {
  /** Resolved app path, e.g. `tools/pixel-art`. */
  path: string
  zIndex: number
  /** How many windows were open when this one opened; offsets its starting position so windows don't stack exactly. */
  cascadeIndex: number
}

const CASCADE_STEP = 30
const CASCADE_STEPS = 6

export function AppWindow({ path, zIndex, cascadeIndex }: AppWindowProps) {
  const { focus, close } = useWindowManager()
  const { isFocused } = useWindowFocus()
  const resolved = resolvePath(path)
  if (!resolved) return null

  const { node } = resolved

  return (
    <Window
      title={node.label}
      maxWidth={node.windowMaxWidth}
      zIndex={zIndex}
      isFocused={isFocused}
      initialOffset={(cascadeIndex % CASCADE_STEPS) * CASCADE_STEP}
      onFocus={() => focus(path)}
      onClose={() => close(path)}
    >
      {node.children ? (
        <DirectoryApp entries={node.children} basePath={`/apps/${path}`} />
      ) : node.component ? (
        <node.component />
      ) : null}
    </Window>
  )
}

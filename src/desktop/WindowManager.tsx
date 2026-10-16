import { createContext, useContext } from 'react'

interface WindowManagerValue {
  /** Resolved app paths (e.g. `tools/pixel-art`) of every open window, in the order they were opened. */
  openPaths: string[]
  /** The path named by the URL, or null when no window is focused. */
  focusedPath: string | null
  focus: (path: string) => void
  close: (path: string) => void
}

export const WindowManagerContext = createContext<WindowManagerValue>({
  openPaths: [],
  focusedPath: null,
  focus: () => {},
  close: () => {},
})

export function useWindowManager() {
  return useContext(WindowManagerContext)
}

interface WindowValue {
  path: string
  isFocused: boolean
}

/** Outside any window (e.g. rendered standalone), an app behaves as if focused. */
export const WindowContext = createContext<WindowValue>({ path: '', isFocused: true })

/** Lets a subapp ask whether its window is focused, without knowing anything about routing. */
export function useWindowFocus() {
  return useContext(WindowContext)
}

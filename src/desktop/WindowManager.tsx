import { createContext, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { AppMessage, AppMessageOf, AppMessageType } from '../apps/messages'

/** A message waiting in a window's inbox until that window's app picks it up. */
export interface Delivery {
  id: number
  /** Path of the sending app. */
  from: string
  message: AppMessage
}

export interface AppTarget {
  path: string
  label: string
}

interface WindowManagerValue {
  /** Resolved app paths (e.g. `tools/pixel-art`) of every open window, in the order they were opened. */
  openPaths: string[]
  /** The path named by the URL, or null when no window is focused. */
  focusedPath: string | null
  focus: (path: string) => void
  close: (path: string) => void
  /** Queues a message for the app at `to`, then opens/focuses its window so it can receive it. */
  send: (from: string, to: string, message: AppMessage) => void
  /** Undelivered messages, keyed by recipient path. */
  inbox: Record<string, Delivery[]>
  acknowledge: (path: string, ids: number[]) => void
  /** Apps whose registry entry `accepts` this message type. */
  targetsFor: (type: AppMessageType) => AppTarget[]
}

export const WindowManagerContext = createContext<WindowManagerValue>({
  openPaths: [],
  focusedPath: null,
  focus: () => {},
  close: () => {},
  send: () => {},
  inbox: {},
  acknowledge: () => {},
  targetsFor: () => [],
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

/** Other apps that accept `type`, each with a `send` that delivers to it and brings its window forward. */
export function useMessageTargets<T extends AppMessageType>(type: T) {
  const { path } = useWindowFocus()
  const { send, targetsFor } = useWindowManager()
  return targetsFor(type)
    .filter((target) => target.path !== path)
    .map((target) => ({ ...target, send: (message: AppMessageOf<T>) => send(path, target.path, message) }))
}

/** Calls `handler` once for each incoming message of `type` addressed to this window, including ones
 *  sent before the window was open. */
export function useAppMessage<T extends AppMessageType>(type: T, handler: (message: AppMessageOf<T>, from: string) => void) {
  const { path } = useWindowFocus()
  const { inbox, acknowledge } = useWindowManager()
  const deliveries = inbox[path]
  const handlerRef = useRef(handler)
  // Remembers what's been handled, so StrictMode's double effect run can't apply a message twice.
  const handledRef = useRef(new Set<number>())

  useLayoutEffect(() => {
    handlerRef.current = handler
  })

  useEffect(() => {
    const pending = (deliveries ?? []).filter((d) => d.message.type === type && !handledRef.current.has(d.id))
    if (pending.length === 0) return
    for (const delivery of pending) {
      handledRef.current.add(delivery.id)
      handlerRef.current(delivery.message as AppMessageOf<T>, delivery.from)
    }
    acknowledge(
      path,
      pending.map((d) => d.id),
    )
  }, [deliveries, type, path, acknowledge])
}

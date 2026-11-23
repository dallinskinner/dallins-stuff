import { useEffect, useRef, useState } from 'react'
import { useWindowFocus, useWindowManager } from '../../desktop/WindowManager'
import { initialState, nextSuggestion, respond, type Beat, type Reply } from './engine'
import { fallback, guide, opening, topics } from './script'
import styles from './AboutApp.module.css'

interface Line {
  id: number
  kind: 'you' | 'say' | 'act'
  text: string
}

const FIRST_BEAT_DELAY = 500
const MAX_BEAT_DELAY = 2200

/** Time to "read" a beat before the next one appears, so stammers and pauses land. */
function beatDelay(beat: Beat) {
  const text = 'say' in beat ? beat.say : beat.act
  return Math.min(300 + text.length * 22, MAX_BEAT_DELAY)
}

export function AboutApp() {
  const { focus } = useWindowManager()
  const { isFocused } = useWindowFocus()
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(true)
  const [suggestion, setSuggestion] = useState(() => nextSuggestion(initialState, guide, topics, fallback))
  const stateRef = useRef(initialState)
  const nextId = useRef(0)
  const timers = useRef<number[]>([])
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Replies open apps from a timeout, so read `focus` through a ref rather than a stale closure.
  const focusRef = useRef(focus)
  useEffect(() => {
    focusRef.current = focus
  }, [focus])

  function addLine(kind: Line['kind'], text: string) {
    const id = nextId.current++
    setLines((prev) => [...prev, { id, kind, text }])
  }

  /** Schedules the reply's beats; callers set `busy` first, and it clears once the last beat lands. */
  function play(reply: Reply) {
    let at = 0
    reply.beats.forEach((beat, i) => {
      if (i > 0) at += beatDelay(reply.beats[i - 1])
      else at = FIRST_BEAT_DELAY
      timers.current.push(
        window.setTimeout(() => ('say' in beat ? addLine('say', beat.say) : addLine('act', beat.act)), at),
      )
    })
    timers.current.push(
      window.setTimeout(() => {
        setBusy(false)
        if (reply.open) focusRef.current(reply.open)
      }, at + FIRST_BEAT_DELAY),
    )
  }

  // Only the opening plays on mount (`busy` starts true for it); later replies are driven by submit.
  useEffect(() => {
    play(opening)
    const pending = timers.current
    return () => {
      pending.forEach(clearTimeout)
      pending.length = 0
    }
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines, busy])

  useEffect(() => {
    if (isFocused && !busy) inputRef.current?.focus()
  }, [isFocused, busy])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    addLine('you', text)
    setInput('')
    const { reply, state } = respond(text, stateRef.current, topics, fallback)
    stateRef.current = state
    setSuggestion(nextSuggestion(state, guide, topics, fallback))
    setBusy(true)
    play(reply)
  }

  // Shown once he's done talking; Tab fills it in, or finishes it if what's typed so far is its start.
  const hint = busy ? undefined : suggestion
  const canComplete = !!hint && input !== hint && hint.toLowerCase().startsWith(input.toLowerCase())

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Tab' || e.shiftKey || !canComplete) return
    e.preventDefault()
    setInput(hint)
  }

  return (
    <div className={styles.app}>
      <div ref={logRef} className={styles.log} aria-live="polite">
        <h1 className={`font-accent hero ${styles.name}`}>Dallin Skinner</h1>
        {lines.map((line) => (
          <p key={line.id} className={styles[line.kind]}>
            {line.kind === 'you' ? `> ${line.text}` : line.kind === 'say' ? `“${line.text}”` : line.text}
          </p>
        ))}
        {busy && <p className={styles.waiting}>...</p>}
      </div>
      <form className={styles.prompt} onSubmit={handleSubmit}>
        <span aria-hidden="true">&gt;</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hint}
          className={styles.input}
          aria-label="Say something"
          autoComplete="off"
          spellCheck={false}
        />
        {canComplete && <kbd className={styles.tab}>tab</kbd>}
      </form>
    </div>
  )
}

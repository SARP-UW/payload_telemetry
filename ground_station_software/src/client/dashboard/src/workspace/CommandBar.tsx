import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'

export type ResultTone = 'ok' | 'err' | 'info'

interface CommandBarProps {
  onRun: (line: string) => void
  onEscape: () => void
  result: { text: string; tone: ResultTone } | null
  children: ReactNode // status strip, right side
}

const MAX_HISTORY = 100

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** One-line terminal-style command input. Fixed height; never grows. */
function CommandBar({ onRun, onEscape, result, children }: CommandBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState<number | null>(null)

  // '/' anywhere outside a text field focuses the command bar.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === '/' && !isEditable(e.target)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const line = value.trim()
    if (line === '') return
    onRun(line)
    setHistory((h) => (h.at(-1) === line ? h : [...h, line].slice(-MAX_HISTORY)))
    setHistIdx(null)
    setValue('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setValue('')
      setHistIdx(null)
      inputRef.current?.blur()
      onEscape()
    } else if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault()
      const idx = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1)
      setHistIdx(idx)
      setValue(history[idx])
    } else if (e.key === 'ArrowDown' && histIdx !== null) {
      e.preventDefault()
      const idx = histIdx + 1
      if (idx >= history.length) {
        setHistIdx(null)
        setValue('')
      } else {
        setHistIdx(idx)
        setValue(history[idx])
      }
    }
  }

  return (
    <form className="bar" onSubmit={onSubmit}>
      <label className="prompt" htmlFor="cmd">
        &gt;
      </label>
      <input
        id="cmd"
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="command (help)"
        autoComplete="off"
        spellCheck={false}
      />
      <output className={`result t-${result?.tone ?? 'info'}`} htmlFor="cmd" title={result?.text}>
        {result?.text ?? ''}
      </output>
      <div className="status">{children}</div>
    </form>
  )
}

export default CommandBar

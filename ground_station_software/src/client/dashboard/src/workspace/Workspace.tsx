import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { PACKET_FIELDS, SLOTS, type Slot, type TelemetryMessage } from '../contract'
import { formatValue } from '../format'
import { connectionInfo, lossTone } from '../health'
import { parseArgs } from '../hooks/commandLogic'
import { lossPercent } from '../hooks/streamLogic'
import { useWebSocket } from '../hooks/useWebSocket'
import { SLOT_SHORT } from '../lanes'
import CommandBar, { type ResultTone } from './CommandBar'
import { parseCommand } from './commandParser'
import GraphTile from './GraphTile'
import InfoOverlay, { type LogEntry } from './InfoOverlay'
import {
  collisions,
  dragRect,
  GRID_COLS,
  GRID_ROWS,
  pxToCells,
  rectStyle,
  sameRect,
  type DragMode,
  type Rect,
} from './layoutLogic'
import {
  addGraph,
  defaultWorkspace,
  findModule,
  listModules,
  parseWorkspace,
  removeModule,
  serializeWorkspace,
  setRect,
  setSource,
  setWindow,
  STORAGE_KEY,
  type GraphModule,
  type OpResult,
  type WorkspaceState,
} from './modules'

const MAX_LOG = 200

interface DragSession {
  id: string
  mode: DragMode
  startX: number
  startY: number
  cellW: number
  cellH: number
  orig: Rect
  candidate: Rect
  valid: boolean
}

interface DragView {
  id: string
  rect: Rect
  valid: boolean
}

function loadWorkspace(): WorkspaceState {
  try {
    return parseWorkspace(localStorage.getItem(STORAGE_KEY)) ?? defaultWorkspace()
  } catch {
    return defaultWorkspace() // storage blocked: start from the default layout
  }
}

const keysOf = (msg: TelemetryMessage | null) => Object.keys(msg?.data ?? {}).join('\n')

/**
 * Full-screen workspace: a fixed grid canvas of draggable, resizable graph
 * modules plus a one-line command bar. Never scrolls.
 */
function Workspace() {
  const {
    status,
    latestBySlot,
    receivedBySlot,
    rateBySlot,
    srcGapsBySlot,
    commands,
    received,
    invalid,
    gaps,
    getMessagesSince,
    sendCommand,
  } = useWebSocket()

  const [ws, setWs] = useState<WorkspaceState>(loadWorkspace)
  const [log, setLog] = useState<LogEntry[]>([])
  const [overlay, setOverlay] = useState<'none' | 'help' | 'log'>('none')
  const [drag, setDrag] = useState<DragView | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const modulesRef = useRef<GraphModule[]>(ws.modules)
  const dragRef = useRef<DragSession | null>(null)
  const logIdRef = useRef(0)

  useEffect(() => {
    modulesRef.current = ws.modules
    try {
      localStorage.setItem(STORAGE_KEY, serializeWorkspace(ws))
    } catch {
      // Storage unavailable: the layout just isn't remembered.
    }
  }, [ws])

  const addLog = useCallback((text: string, tone: ResultTone) => {
    logIdRef.current += 1
    const entry = { id: logIdRef.current, time: Date.now(), text, tone }
    setLog((prev) => [...prev, entry].slice(-MAX_LOG))
  }, [])

  // Field lists for the selects; user slot fields are whatever has arrived.
  const u1Keys = keysOf(latestBySlot.user1)
  const u2Keys = keysOf(latestBySlot.user2)
  const fieldsBySlot = useMemo<Record<Slot, readonly string[]>>(
    () => ({
      reserved: [...PACKET_FIELDS],
      user1: u1Keys ? u1Keys.split('\n') : [],
      user2: u2Keys ? u2Keys.split('\n') : [],
    }),
    [u1Keys, u2Keys],
  )

  // ---------- module operations (UI) ----------

  const onRemove = useCallback((id: string) => {
    setWs((prev) => {
      const r = removeModule(prev, id)
      return r.ok ? r.state : prev
    })
  }, [])

  const onSource = useCallback((id: string, slot: Slot, field: string | null) => {
    setWs((prev) => {
      const r = setSource(prev, id, slot, field)
      return r.ok ? r.state : prev
    })
  }, [])

  const onWindow = useCallback((id: string, seconds: number) => {
    setWs((prev) => {
      const r = setWindow(prev, id, seconds)
      return r.ok ? r.state : prev
    })
  }, [])

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLElement>, id: string) => {
      if (e.target !== e.currentTarget) return // keys typed into the module's selects
      const mod = modulesRef.current.find((m) => m.id === id)
      if (!mod) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onRemove(id)
        addLog(`Removed ${id}`, 'ok')
        return
      }
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }
      const delta = step[e.key]
      if (!delta) return
      e.preventDefault()
      const next = dragRect(mod.rect, e.shiftKey ? 'resize' : 'move', delta[0], delta[1])
      if (sameRect(next, mod.rect)) return
      const hits = collisions(modulesRef.current, next, id)
      if (hits.length > 0) {
        addLog(`${id} blocked by ${hits.join(', ')}`, 'err')
        return
      }
      setWs((prev) => {
        const r = setRect(prev, id, next)
        return r.ok ? r.state : prev
      })
    },
    [addLog, onRemove],
  )

  // ---------- drag and resize ----------

  const onDragStart = useCallback((e: PointerEvent<HTMLElement>, id: string, mode: DragMode) => {
    if (e.button !== 0) return
    const canvas = canvasRef.current
    const mod = modulesRef.current.find((m) => m.id === id)
    if (!canvas || !mod) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const box = canvas.getBoundingClientRect()
    dragRef.current = {
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      cellW: box.width / GRID_COLS,
      cellH: box.height / GRID_ROWS,
      orig: mod.rect,
      candidate: mod.rect,
      valid: true,
    }
    setDrag({ id, rect: mod.rect, valid: true })
  }, [])

  const onDragMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const d = dragRef.current
    if (!d) return
    const candidate = dragRect(
      d.orig,
      d.mode,
      pxToCells(e.clientX - d.startX, d.cellW),
      pxToCells(e.clientY - d.startY, d.cellH),
    )
    if (sameRect(candidate, d.candidate)) return
    const valid = collisions(modulesRef.current, candidate, d.id).length === 0
    dragRef.current = { ...d, candidate, valid }
    setDrag({ id: d.id, rect: candidate, valid })
  }, [])

  const onDragEnd = useCallback((e: PointerEvent<HTMLElement>) => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    setDrag(null)
    if (e.type === 'pointercancel' || !d.valid || sameRect(d.candidate, d.orig)) return
    setWs((prev) => {
      const r = setRect(prev, d.id, d.candidate)
      return r.ok ? r.state : prev
    })
  }, [])

  // Esc cancels a drag in progress.
  useEffect(() => {
    if (!drag) return
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        dragRef.current = null
        setDrag(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drag])

  // ---------- command bar ----------

  function apply(result: OpResult) {
    if (result.ok) setWs(result.state)
    addLog(result.message, result.ok ? 'ok' : 'err')
  }

  function run(line: string) {
    const cmd = parseCommand(line)
    switch (cmd.kind) {
      case 'empty':
        return
      case 'error':
        return addLog(cmd.message, 'err')
      case 'help':
        return setOverlay((o) => (o === 'help' ? 'none' : 'help'))
      case 'log':
        return setOverlay((o) => (o === 'log' ? 'none' : 'log'))
      case 'clear':
        return setLog([])
      case 'list':
        return addLog(listModules(ws), 'info')
      case 'reset':
        setWs(defaultWorkspace())
        return addLog('Layout reset to default', 'ok')
      case 'fields': {
        const fields = fieldsBySlot[cmd.slot]
        return addLog(
          fields.length ? `${SLOT_SHORT[cmd.slot]} fields: ${fields.join(', ')}` : `No ${SLOT_SHORT[cmd.slot]} data yet`,
          'info',
        )
      }
      case 'add':
        return apply(addGraph(ws, cmd.slot, cmd.field))
      case 'remove':
        return apply(removeModule(ws, cmd.id))
      case 'source':
        return apply(setSource(ws, cmd.id, cmd.slot, cmd.field))
      case 'window':
        return apply(setWindow(ws, cmd.id, cmd.seconds))
      case 'move':
      case 'size': {
        const mod = findModule(ws, cmd.id)
        if (!mod) return addLog(`No module '${cmd.id}'. Try: list`, 'err')
        const rect = cmd.kind === 'move' ? { ...mod.rect, x: cmd.x, y: cmd.y } : { ...mod.rect, w: cmd.w, h: cmd.h }
        return apply(setRect(ws, cmd.id, rect))
      }
      case 'send': {
        const args = parseArgs(cmd.argsText)
        if (!args.ok) return addLog(args.error, 'err')
        const cmdSeq = sendCommand(cmd.target, cmd.command, args.value)
        return addLog(
          status === 'open'
            ? `Command #${cmdSeq} to ${SLOT_SHORT[cmd.target]}: ${cmd.command} sent, waiting for ack (log)`
            : `Command #${cmdSeq} not sent: not connected`,
          status === 'open' ? 'info' : 'err',
        )
      }
    }
  }

  // ---------- render ----------

  const connection = connectionInfo(status)
  const stale = status !== 'open'
  const last = log.at(-1) ?? null
  const result = last ?? { text: 'Type help for commands. Press / to focus this bar.', tone: 'info' as const }

  return (
    <div className="ws">
      <div className="canvas" ref={canvasRef}>
        {ws.modules.map((mod) => (
          <GraphTile
            key={mod.id}
            mod={mod}
            stale={stale}
            dragging={drag?.id === mod.id}
            fieldsBySlot={fieldsBySlot}
            getMessagesSince={getMessagesSince}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onKey={onKey}
            onRemove={onRemove}
            onSource={onSource}
            onWindow={onWindow}
          />
        ))}

        {drag && (
          <div className={`ghost${drag.valid ? '' : ' bad'}`} style={rectStyle(drag.rect)}>
            <span>
              {drag.rect.w}×{drag.rect.h} @ {drag.rect.x},{drag.rect.y}
              {drag.valid ? '' : ' · blocked'}
            </span>
          </div>
        )}

        {ws.modules.length === 0 && (
          <p className="canvas-empty">No modules. Type: add graph reserved altitude · or: reset</p>
        )}
      </div>

      {overlay !== 'none' && <InfoOverlay mode={overlay} log={log} commands={commands} />}

      <CommandBar onRun={run} onEscape={() => setOverlay('none')} result={result}>
        <span className={`t-${connection.tone}`} role="status">
          {connection.label.toUpperCase()}
        </span>
        {SLOTS.map((slot) => {
          const missing = lossPercent(receivedBySlot[slot], srcGapsBySlot[slot])
          return (
            <span key={slot} title={`${SLOT_SHORT[slot]}: rate and missing packets`}>
              {SLOT_SHORT[slot]} {formatValue(rateBySlot[slot], 1)}/s{' '}
              <span className={`t-${lossTone(missing)}`}>{formatValue(missing, 1)}%</span>
            </span>
          )
        })}
        <span className="t-info" title="Messages received · invalid · server-to-browser drops">
          {received} msg · {invalid} inv · {gaps} drop
        </span>
      </CommandBar>
    </div>
  )
}

export default Workspace

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildCommand,
  isReserved,
  parseServerMessage,
  SLOTS,
  type ConfigMessage,
  type ReservedTelemetry,
  type Slot,
  type TelemetryMessage,
  type UserSlot,
  type UserTelemetry,
} from '../contract'
import { addRecord, applyAck, expirePending, type CommandRecord } from './commandLogic'
import {
  backoffDelay,
  bySlot,
  INITIAL_GAP_STATE,
  INITIAL_SLOT_GAPS,
  messageRate,
  nextGapState,
  nextSlotGaps,
  readSince,
  resetSlotBaselines,
  wsUrl,
  type GapState,
  type ReadResult,
  type SlotGaps,
} from './streamLogic'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting'

// Valid telemetry messages retained for getMessagesSince; oldest dropped beyond this.
export const HISTORY_LIMIT = 2000

// Sliding window for the displayed message rates.
const RATE_WINDOW_MS = 2000

export type LatestBySlot = { reserved: ReservedTelemetry | null } & Record<UserSlot, UserTelemetry | null>

interface Snapshot {
  latestBySlot: LatestBySlot
  receivedBySlot: Record<Slot, number>
  rateBySlot: Record<Slot, number> // valid msgs/s over RATE_WINDOW_MS
  srcGapsBySlot: Record<Slot, number> // missing src_seq: drops before the server
  config: ConfigMessage['slots'] | null
  commands: readonly CommandRecord[]
  received: number // all slots; also the getMessagesSince cursor
  invalid: number
  gaps: number // missing seq: drops between server and browser
}

const EMPTY_LATEST: LatestBySlot = { reserved: null, user1: null, user2: null }

const EMPTY_SNAPSHOT: Snapshot = {
  latestBySlot: EMPTY_LATEST,
  receivedBySlot: bySlot(() => 0),
  rateBySlot: bySlot(() => 0),
  srcGapsBySlot: bySlot(() => 0),
  config: null,
  commands: [],
  received: 0,
  invalid: 0,
  gaps: 0,
}

export interface WebSocketStream extends Snapshot {
  status: ConnectionStatus
  getMessagesSince: (cursor: number) => ReadResult<TelemetryMessage>
  /** Send a command; returns its cmd_seq. Recorded as 'not_connected' if the socket isn't open. */
  sendCommand: (target: Slot, command: string, args: Record<string, unknown>) => number
}

export function useWebSocket(): WebSocketStream {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT)

  const wsRef = useRef<WebSocket | null>(null)

  // Incoming messages land in refs, not React state, so a fast stream doesn't
  // re-render per message. A requestAnimationFrame loop publishes a snapshot
  // at most once per frame, and only when something changed.
  const historyRef = useRef<TelemetryMessage[]>([])
  const receivedRef = useRef(0) // monotonic; also the getMessagesSince cursor
  const invalidRef = useRef(0)
  const gapRef = useRef<GapState>(INITIAL_GAP_STATE)
  const srcGapsRef = useRef<SlotGaps>(INITIAL_SLOT_GAPS)
  const latestRef = useRef<LatestBySlot>(EMPTY_LATEST)
  const receivedBySlotRef = useRef<Record<Slot, number>>(bySlot(() => 0))
  const receiptTimesRef = useRef<Record<Slot, number[]>>(bySlot(() => []))
  const configRef = useRef<ConfigMessage['slots'] | null>(null)
  const commandsRef = useRef<readonly CommandRecord[]>([])
  const cmdSeqRef = useRef(0)
  const attemptRef = useRef(0)
  const dirtyRef = useRef(false)

  useEffect(() => {
    // Effect-local so a StrictMode double mount can't leak handlers from the
    // first (already cleaned up) socket into the second mount's state.
    let disposed = false
    let reconnectTimer: number | undefined
    let rafId = 0
    let publishedRates = bySlot(() => 0)

    historyRef.current = []
    receivedRef.current = 0
    invalidRef.current = 0
    gapRef.current = INITIAL_GAP_STATE
    srcGapsRef.current = INITIAL_SLOT_GAPS
    latestRef.current = { ...EMPTY_LATEST }
    receivedBySlotRef.current = bySlot(() => 0)
    receiptTimesRef.current = bySlot(() => [])
    configRef.current = null
    commandsRef.current = []
    cmdSeqRef.current = 0
    attemptRef.current = 0
    dirtyRef.current = true

    function onTelemetry(msg: TelemetryMessage) {
      const history = historyRef.current
      history.push(msg)
      if (history.length > HISTORY_LIMIT) {
        history.splice(0, history.length - HISTORY_LIMIT)
      }
      receivedRef.current += 1
      receivedBySlotRef.current[msg.slot] += 1
      gapRef.current = nextGapState(gapRef.current, msg.seq)
      srcGapsRef.current = nextSlotGaps(srcGapsRef.current, msg.slot, msg.src_seq)
      if (isReserved(msg)) {
        latestRef.current.reserved = msg
      } else {
        latestRef.current[msg.slot] = msg
      }

      // Trimmed on push (not in flush) so this stays bounded even when
      // rAF is paused in a background tab.
      const now = performance.now()
      const times = receiptTimesRef.current[msg.slot]
      times.push(now)
      while (times[0] <= now - RATE_WINDOW_MS) times.shift()
    }

    function connect() {
      const ws = new WebSocket(wsUrl(window.location))
      wsRef.current = ws

      ws.onopen = () => {
        attemptRef.current = 0
        // New connection, new baselines: anything missed while our socket was
        // down is not counted as a gap.
        gapRef.current = { ...gapRef.current, lastSeq: null }
        srcGapsRef.current = resetSlotBaselines(srcGapsRef.current)
        setStatus('open')
      }

      ws.onmessage = (event: MessageEvent) => {
        const msg = parseServerMessage(event.data)
        if (msg === null) {
          invalidRef.current += 1
        } else if (msg.type === 'telemetry') {
          onTelemetry(msg)
        } else if (msg.type === 'config') {
          configRef.current = msg.slots
        } else {
          commandsRef.current = applyAck(commandsRef.current, msg)
        }
        dirtyRef.current = true
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onclose = () => {
        if (disposed) return
        setStatus('reconnecting')
        const delay = backoffDelay(attemptRef.current)
        attemptRef.current += 1
        reconnectTimer = window.setTimeout(connect, delay)
      }
    }

    function flush() {
      const now = performance.now()

      const commands = expirePending(commandsRef.current, now)
      if (commands !== commandsRef.current) {
        commandsRef.current = commands
        dirtyRef.current = true
      }

      // Recomputed every frame so rates decay to 0 when messages stop; they
      // only change when a timestamp enters or leaves the window.
      const rates = bySlot((slot) => messageRate(receiptTimesRef.current[slot], now, RATE_WINDOW_MS))
      const ratesChanged = SLOTS.some((slot) => rates[slot] !== publishedRates[slot])

      if (dirtyRef.current || ratesChanged) {
        dirtyRef.current = false
        publishedRates = rates
        setSnapshot({
          latestBySlot: { ...latestRef.current },
          receivedBySlot: { ...receivedBySlotRef.current },
          rateBySlot: rates,
          srcGapsBySlot: bySlot((slot) => srcGapsRef.current[slot].gaps),
          config: configRef.current,
          commands: commandsRef.current,
          received: receivedRef.current,
          invalid: invalidRef.current,
          gaps: gapRef.current.gaps,
        })
      }
      rafId = requestAnimationFrame(flush)
    }

    connect()
    rafId = requestAnimationFrame(flush)

    return () => {
      disposed = true
      cancelAnimationFrame(rafId)
      window.clearTimeout(reconnectTimer)
      const ws = wsRef.current
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.close()
        wsRef.current = null
      }
    }
  }, [])

  const getMessagesSince = useCallback(
    (cursor: number) => readSince(historyRef.current, receivedRef.current, cursor),
    [],
  )

  const sendCommand = useCallback((target: Slot, command: string, args: Record<string, unknown>) => {
    const cmdSeq = cmdSeqRef.current
    cmdSeqRef.current += 1
    const record = { cmdSeq, target, command, args, sentAt: performance.now() }
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(buildCommand(cmdSeq, target, command, args))
      commandsRef.current = addRecord(commandsRef.current, { ...record, status: 'pending', reason: '' })
    } else {
      commandsRef.current = addRecord(commandsRef.current, {
        ...record,
        status: 'not_connected',
        reason: 'not connected to the ground station',
      })
    }
    dirtyRef.current = true
    return cmdSeq
  }, [])

  return { status, ...snapshot, getMessagesSince, sendCommand }
}

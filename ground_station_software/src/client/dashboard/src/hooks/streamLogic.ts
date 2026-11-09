// Pure stream logic used by useWebSocket. No React, no DOM, no sockets, so it
// can be unit tested directly.

import { SLOTS, type Slot } from '../contract'

/** Build a value for every slot. */
export function bySlot<T>(make: (slot: Slot) => T): Record<Slot, T> {
  return Object.fromEntries(SLOTS.map((slot) => [slot, make(slot)])) as Record<Slot, T>
}

// Exponential backoff for reconnect attempts: 1s, 2s, 4s, capped at 8s, with
// jitter. The 8s cap is deliberately short so a reconnect can be watched
// end-to-end during development; revisit for flight ops.
export const BACKOFF_BASE_MS = 1000
export const BACKOFF_CAP_MS = 8000

/**
 * Reconnect delay for the given attempt (0-based), using "equal jitter": a
 * random value in [exp/2, exp], where exp is the capped exponential delay.
 * Never exceeds BACKOFF_CAP_MS.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt)
  return exp / 2 + random() * (exp / 2)
}

export interface GapState {
  lastSeq: number | null
  gaps: number
}

export const INITIAL_GAP_STATE: GapState = { lastSeq: null, gaps: 0 }

/**
 * Advance gap tracking by one received seq. Counts missing seq values. A seq
 * that goes backwards (or repeats) is treated as a server restart: the
 * baseline resets and no gap is counted.
 */
export function nextGapState(state: GapState, seq: number): GapState {
  const { lastSeq, gaps } = state
  if (lastSeq !== null && seq > lastSeq + 1) {
    return { lastSeq: seq, gaps: gaps + (seq - lastSeq - 1) }
  }
  return { lastSeq: seq, gaps }
}

export type SlotGaps = Record<Slot, GapState>

export const INITIAL_SLOT_GAPS: SlotGaps = bySlot(() => INITIAL_GAP_STATE)

/**
 * Per-slot gap tracking on src_seq (drops before the server). Each slot has its
 * own baseline; a null src_seq (source doesn't number its packets) changes nothing.
 */
export function nextSlotGaps(state: SlotGaps, slot: Slot, srcSeq: number | null): SlotGaps {
  if (srcSeq === null) return state
  return { ...state, [slot]: nextGapState(state[slot], srcSeq) }
}

/** Clear every slot's baseline (keeping counts), e.g. on reconnect. */
export function resetSlotBaselines(state: SlotGaps): SlotGaps {
  return bySlot((slot) => ({ lastSeq: null, gaps: state[slot].gaps }))
}

export interface ReadResult<T> {
  messages: readonly T[]
  cursor: number
}

/**
 * Return the messages received after `cursor`.
 *
 * `total` is the monotonic count of messages ever received (not reset by
 * trimming), so history[i] has cursor position `total - history.length + i`.
 * If `cursor` is older than the oldest retained message, everything retained
 * is returned. A cursor ahead of `total` (stale, e.g. from before a remount)
 * is treated as a reset and also gets everything retained.
 */
export function readSince<T>(history: readonly T[], total: number, cursor: number): ReadResult<T> {
  const oldest = total - history.length
  const start = cursor > total ? oldest : Math.max(cursor, oldest)
  return { messages: history.slice(start - oldest), cursor: total }
}

/** Packet loss as a percentage: gaps / (received + gaps). 0 when nothing seen. */
export function lossPercent(received: number, gaps: number): number {
  const expected = received + gaps
  return expected === 0 ? 0 : (gaps / expected) * 100
}

/**
 * Messages per second from receipt timestamps (ms), counting those in the
 * sliding window (now - windowMs, now].
 */
export function messageRate(receiptTimes: readonly number[], now: number, windowMs: number): number {
  const cutoff = now - windowMs
  let count = 0
  for (const t of receiptTimes) {
    if (t > cutoff && t <= now) count += 1
  }
  return count / (windowMs / 1000)
}

export function wsUrl(loc: Pick<Location, 'protocol' | 'host'>): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`
}

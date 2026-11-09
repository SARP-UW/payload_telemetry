// Pure command tracking used by useWebSocket. No React, no DOM, no sockets.

import type { CommandAck, Slot } from '../contract'

// How long a sent command waits for an ack before it is marked 'no_ack'.
export const ACK_TIMEOUT_MS = 5000 // dev default [confirm ack timing with Christian]

// Recent commands kept for display.
export const MAX_COMMANDS = 20

export interface CommandRecord {
  cmdSeq: number
  target: Slot
  command: string
  args: Record<string, unknown>
  sentAt: number // ms, same clock as the `now` passed to expirePending
  status: string // 'pending' | 'not_connected' | 'no_ack' | a server ack status
  reason: string
}

/** Append a record, keeping only the newest MAX_COMMANDS. */
export function addRecord(records: readonly CommandRecord[], rec: CommandRecord): CommandRecord[] {
  return [...records, rec].slice(-MAX_COMMANDS)
}

/** Apply a server ack to the matching record. Acks with no matching cmd_seq are ignored. */
export function applyAck(records: readonly CommandRecord[], ack: CommandAck): CommandRecord[] {
  if (ack.cmd_seq === null || !records.some((r) => r.cmdSeq === ack.cmd_seq)) return [...records]
  return records.map((r) => (r.cmdSeq === ack.cmd_seq ? { ...r, status: ack.status, reason: ack.reason } : r))
}

/** Mark pending records older than timeoutMs as 'no_ack'. Returns the same array if nothing changed. */
export function expirePending(
  records: readonly CommandRecord[],
  now: number,
  timeoutMs: number = ACK_TIMEOUT_MS,
): readonly CommandRecord[] {
  const overdue = (r: CommandRecord) => r.status === 'pending' && now - r.sentAt >= timeoutMs
  if (!records.some(overdue)) return records
  return records.map((r) => (overdue(r) ? { ...r, status: 'no_ack', reason: 'no acknowledgement received' } : r))
}

export type ParsedArgs = { ok: true; value: Record<string, unknown> } | { ok: false; error: string }

/** Parse the optional args text box: empty means {}, otherwise a JSON object. */
export function parseArgs(text: string): ParsedArgs {
  if (text.trim() === '') return { ok: true, value: {} }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Args must be valid JSON' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Args must be a JSON object, like {"key": 1}' }
  }
  return { ok: true, value: parsed as Record<string, unknown> }
}

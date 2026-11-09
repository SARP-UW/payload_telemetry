// How connection, link health and command states are shown. Pure, no React.

import type { ConnectionStatus } from './hooks/useWebSocket'

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

// Missing-packet thresholds for the link health colours.
export const LOSS_WARN_PCT = 1 // dev default [confirm with team]
export const LOSS_BAD_PCT = 5 // dev default [confirm with team]

export function connectionInfo(status: ConnectionStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'open':
      return { label: 'Live', tone: 'good' }
    case 'connecting':
      return { label: 'Connecting…', tone: 'warn' }
    case 'reconnecting':
      return { label: 'Reconnecting…', tone: 'bad' }
  }
}

export function lossTone(pct: number): Tone {
  if (pct >= LOSS_BAD_PCT) return 'bad'
  if (pct >= LOSS_WARN_PCT) return 'warn'
  return 'good'
}

export type SlotState = 'live' | 'no-data' | 'offline'

/** A slot is live while connected and receiving; 'no-data' if connected but silent. */
export function slotState(status: ConnectionStatus, rate: number): SlotState {
  if (status !== 'open') return 'offline'
  return rate > 0 ? 'live' : 'no-data'
}

export const SLOT_STATE_INFO: Record<SlotState, { label: string; tone: Tone }> = {
  live: { label: 'Live', tone: 'good' },
  'no-data': { label: 'No data', tone: 'warn' },
  offline: { label: 'Offline', tone: 'neutral' },
}

/** Plain-language label and colour for a command status (client or server side). */
export function commandInfo(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'pending':
      return { label: 'Waiting for ack', tone: 'neutral' }
    case 'acked':
      return { label: 'Acknowledged', tone: 'good' }
    case 'not_sent':
      return { label: 'Not sent', tone: 'warn' }
    case 'no_ack':
      return { label: 'No ack', tone: 'bad' }
    case 'not_connected':
      return { label: 'Not connected', tone: 'bad' }
    case 'rejected':
      return { label: 'Rejected', tone: 'bad' }
    default:
      return { label: status, tone: 'neutral' }
  }
}

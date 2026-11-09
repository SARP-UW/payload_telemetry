// Wire contract for messages on the ground-station WebSocket (format v2).
// This is the only TS file that names packet fields. Everything else iterates
// PACKET_FIELDS or goes through parseServerMessage.
//
// Mirrors ground_station_software/src/server/sockets/ (packager.py: telemetry,
// app.py: config, commands.py: command / command_ack) and the Packet dataclass
// in ground_station_software/src/constants.py (Reserved data).
// Kept in sync by hand -- update both sides together.

export const SLOTS = ['reserved', 'user1', 'user2'] as const

export type Slot = (typeof SLOTS)[number]

export type UserSlot = Exclude<Slot, 'reserved'>

// Reserved (GPS) packet fields.
export const PACKET_FIELDS = [
  'packet_id',
  'temp',
  'latitude',
  'longitude',
  'altitude',
  'utc_time',
  'velocity',
] as const

export type PacketField = (typeof PACKET_FIELDS)[number]

export type PacketData = Record<PacketField, number>

interface TelemetryBase {
  type: 'telemetry' // PROVISIONAL: pending backend contract
  seq: number // PROVISIONAL: server-wide; gaps = drops between server and browser
  t_ms: number // PROVISIONAL: ms since server start
  peripheral_id: number // PROVISIONAL
  src_seq: number | null // PROVISIONAL: per source; gaps = drops before the server
}

export interface ReservedTelemetry extends TelemetryBase {
  slot: 'reserved'
  data: PacketData
}

// User1/User2 packet structure isn't defined yet, so any numeric fields are accepted.
export interface UserTelemetry extends TelemetryBase {
  slot: UserSlot
  data: Record<string, number>
}

export type TelemetryMessage = ReservedTelemetry | UserTelemetry

export type SlotConfig = Record<string, unknown>

export interface ConfigMessage {
  type: 'config' // PROVISIONAL
  slots: Record<Slot, SlotConfig>
}

export interface CommandAck {
  type: 'command_ack' // PROVISIONAL
  cmd_seq: number | null
  status: string // e.g. 'not_sent', 'rejected'; kept open for future statuses
  reason: string
}

export type ServerMessage = TelemetryMessage | ConfigMessage | CommandAck

export function isReserved(msg: TelemetryMessage): msg is ReservedTelemetry {
  return msg.slot === 'reserved'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isSlot(value: unknown): value is Slot {
  return typeof value === 'string' && (SLOTS as readonly string[]).includes(value)
}

function parseTelemetry(msg: Record<string, unknown>): TelemetryMessage | null {
  const { seq, t_ms, slot, peripheral_id, src_seq, data } = msg
  if (!isCount(seq) || !isFiniteNumber(t_ms) || !isSlot(slot) || !isCount(peripheral_id)) return null
  if (src_seq !== null && !isCount(src_seq)) return null
  if (!isRecord(data)) return null
  const base = { type: 'telemetry' as const, seq, t_ms, peripheral_id, src_seq }

  if (slot === 'reserved') {
    const out = {} as PacketData
    for (const field of PACKET_FIELDS) {
      const value = data[field]
      if (!isFiniteNumber(value)) return null
      out[field] = value
    }
    return { ...base, slot, data: out }
  }

  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!isFiniteNumber(value)) return null
    out[key] = value
  }
  return { ...base, slot, data: out }
}

function parseConfig(msg: Record<string, unknown>): ConfigMessage | null {
  const { slots } = msg
  if (!isRecord(slots)) return null
  const out = {} as Record<Slot, SlotConfig>
  for (const slot of SLOTS) {
    const cfg = slots[slot]
    out[slot] = isRecord(cfg) ? { ...cfg } : {}
  }
  return { type: 'config', slots: out }
}

function parseAck(msg: Record<string, unknown>): CommandAck | null {
  const { cmd_seq, status, reason } = msg
  if (cmd_seq !== null && !isCount(cmd_seq)) return null
  if (typeof status !== 'string' || status === '' || typeof reason !== 'string') return null
  return { type: 'command_ack', cmd_seq, status, reason }
}

/**
 * Validate a raw WebSocket frame. Returns a typed message, or null for anything
 * malformed. Never throws -- callers count and drop nulls.
 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null

  switch (parsed.type) {
    case 'telemetry':
      return parseTelemetry(parsed)
    case 'config':
      return parseConfig(parsed)
    case 'command_ack':
      return parseAck(parsed)
    default:
      return null
  }
}

/** JSON for a browser -> server command request (see server/sockets/commands.py). */
export function buildCommand(
  cmdSeq: number,
  target: Slot,
  command: string,
  args: Record<string, unknown>,
): string {
  return JSON.stringify({ type: 'command', cmd_seq: cmdSeq, target, command, args }) // PROVISIONAL
}

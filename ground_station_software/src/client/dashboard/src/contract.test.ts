import { describe, expect, it } from 'vitest'
import { buildCommand, isReserved, PACKET_FIELDS, parseServerMessage } from './contract'

const reservedData = () => Object.fromEntries(PACKET_FIELDS.map((field, i) => [field, i + 0.5]))

function telemetry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'telemetry',
    seq: 7,
    t_ms: 700,
    slot: 'reserved',
    peripheral_id: 0,
    src_seq: 3,
    data: reservedData(),
    ...overrides,
  }
}

const encode = (value: unknown) => JSON.stringify(value)

describe('parseServerMessage: telemetry', () => {
  it('accepts a Reserved message and strips unknown keys', () => {
    const msg = parseServerMessage(encode({ ...telemetry({ data: { ...reservedData(), extra: 1 } }), junk: true }))
    expect(msg).toEqual({
      type: 'telemetry',
      seq: 7,
      t_ms: 700,
      slot: 'reserved',
      peripheral_id: 0,
      src_seq: 3,
      data: reservedData(),
    })
    expect(msg?.type === 'telemetry' && isReserved(msg)).toBe(true)
  })

  it('rejects a Reserved message missing a packet field', () => {
    const data = reservedData()
    delete data[PACKET_FIELDS[0]]
    expect(parseServerMessage(encode(telemetry({ data })))).toBeNull()
  })

  it('accepts a User message with any numeric fields', () => {
    const msg = parseServerMessage(encode(telemetry({ slot: 'user1', peripheral_id: 1, data: { '[field_1]': 1.5 } })))
    expect(msg).toMatchObject({ type: 'telemetry', slot: 'user1', data: { '[field_1]': 1.5 } })
  })

  it('rejects a User message with a non-numeric value', () => {
    expect(parseServerMessage(encode(telemetry({ slot: 'user2', data: { a: '1' } })))).toBeNull()
  })

  it('rejects an unknown slot', () => {
    expect(parseServerMessage(encode(telemetry({ slot: 'user3' })))).toBeNull()
  })

  it('accepts a null src_seq and rejects a non-integer one', () => {
    expect(parseServerMessage(encode(telemetry({ src_seq: null })))).toMatchObject({ src_seq: null })
    expect(parseServerMessage(encode(telemetry({ src_seq: '3' })))).toBeNull()
    expect(parseServerMessage(encode(telemetry({ src_seq: 1.5 })))).toBeNull()
  })

  it('rejects bad envelope fields', () => {
    expect(parseServerMessage(encode(telemetry({ seq: '7' })))).toBeNull()
    expect(parseServerMessage(encode(telemetry({ seq: -1 })))).toBeNull()
    expect(parseServerMessage(encode(telemetry({ peripheral_id: undefined })))).toBeNull()
    expect(parseServerMessage(encode(telemetry({ data: [] })))).toBeNull()
  })
})

describe('parseServerMessage: config and command_ack', () => {
  it('accepts a config message and fills missing slots with {}', () => {
    const msg = parseServerMessage(encode({ type: 'config', slots: { user1: { graph_1_type: 'bar' } } }))
    expect(msg).toEqual({
      type: 'config',
      slots: { reserved: {}, user1: { graph_1_type: 'bar' }, user2: {} },
    })
  })

  it('rejects a config message without slots', () => {
    expect(parseServerMessage(encode({ type: 'config' }))).toBeNull()
  })

  it('accepts a command_ack, including a null cmd_seq', () => {
    const ack = { type: 'command_ack', cmd_seq: 4, status: 'not_sent', reason: 'uplink not implemented' }
    expect(parseServerMessage(encode(ack))).toEqual(ack)
    expect(parseServerMessage(encode({ ...ack, cmd_seq: null }))).toMatchObject({ cmd_seq: null })
  })

  it('rejects a malformed command_ack', () => {
    const ack = { type: 'command_ack', cmd_seq: 4, status: 'not_sent', reason: 'x' }
    expect(parseServerMessage(encode({ ...ack, status: '' }))).toBeNull()
    expect(parseServerMessage(encode({ ...ack, cmd_seq: '4' }))).toBeNull()
    expect(parseServerMessage(encode({ ...ack, reason: 5 }))).toBeNull()
  })
})

describe('parseServerMessage: bad input', () => {
  it('rejects unknown types, non-JSON and non-strings without throwing', () => {
    expect(parseServerMessage(encode({ type: 'status' }))).toBeNull()
    expect(parseServerMessage('not json')).toBeNull()
    expect(parseServerMessage('{"type":')).toBeNull()
    expect(parseServerMessage('42')).toBeNull()
    expect(parseServerMessage('null')).toBeNull()
    expect(parseServerMessage('[]')).toBeNull()
    expect(parseServerMessage(new ArrayBuffer(4))).toBeNull()
    expect(parseServerMessage(undefined)).toBeNull()
  })
})

describe('buildCommand', () => {
  it('builds the request the server expects', () => {
    expect(JSON.parse(buildCommand(3, 'user2', '[cmd]', { a: 1 }))).toEqual({
      type: 'command',
      cmd_seq: 3,
      target: 'user2',
      command: '[cmd]',
      args: { a: 1 },
    })
  })
})

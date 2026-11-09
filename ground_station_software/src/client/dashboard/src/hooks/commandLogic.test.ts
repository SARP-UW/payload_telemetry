import { describe, expect, it } from 'vitest'
import type { CommandAck } from '../contract'
import {
  ACK_TIMEOUT_MS,
  addRecord,
  applyAck,
  expirePending,
  MAX_COMMANDS,
  parseArgs,
  type CommandRecord,
} from './commandLogic'

function record(cmdSeq: number, overrides: Partial<CommandRecord> = {}): CommandRecord {
  return {
    cmdSeq,
    target: 'user1',
    command: '[cmd]',
    args: {},
    sentAt: 1000,
    status: 'pending',
    reason: '',
    ...overrides,
  }
}

const ack = (cmd_seq: number | null, status = 'not_sent'): CommandAck => ({
  type: 'command_ack',
  cmd_seq,
  status,
  reason: 'uplink not implemented',
})

describe('applyAck', () => {
  it('updates the matching record only', () => {
    const out = applyAck([record(1), record(2)], ack(2))
    expect(out.map((r) => r.status)).toEqual(['pending', 'not_sent'])
    expect(out[1].reason).toBe('uplink not implemented')
  })

  it('ignores acks that match nothing', () => {
    const records = [record(1)]
    expect(applyAck(records, ack(9))).toEqual(records)
    expect(applyAck(records, ack(null, 'rejected'))).toEqual(records)
  })
})

describe('expirePending', () => {
  it('marks only overdue pending records as no_ack', () => {
    const records = [record(1), record(2, { status: 'not_sent' }), record(3, { sentAt: 4000 })]
    const out = expirePending(records, 1000 + ACK_TIMEOUT_MS)
    expect(out.map((r) => r.status)).toEqual(['no_ack', 'not_sent', 'pending'])
  })

  it('returns the same array when nothing is overdue', () => {
    const records = [record(1)]
    expect(expirePending(records, 1000 + ACK_TIMEOUT_MS - 1)).toBe(records)
  })
})

describe('addRecord', () => {
  it(`keeps only the newest ${MAX_COMMANDS}`, () => {
    let records: CommandRecord[] = []
    for (let i = 0; i < MAX_COMMANDS + 5; i++) records = addRecord(records, record(i))
    expect(records).toHaveLength(MAX_COMMANDS)
    expect(records[0].cmdSeq).toBe(5)
    expect(records.at(-1)?.cmdSeq).toBe(MAX_COMMANDS + 4)
  })
})

describe('parseArgs', () => {
  it('treats empty input as {}', () => {
    expect(parseArgs('')).toEqual({ ok: true, value: {} })
    expect(parseArgs('   ')).toEqual({ ok: true, value: {} })
  })

  it('accepts a JSON object', () => {
    expect(parseArgs('{"mode": 2}')).toEqual({ ok: true, value: { mode: 2 } })
  })

  it('rejects invalid JSON and non-objects', () => {
    expect(parseArgs('{mode: 2}').ok).toBe(false)
    expect(parseArgs('[1, 2]').ok).toBe(false)
    expect(parseArgs('5').ok).toBe(false)
    expect(parseArgs('null').ok).toBe(false)
  })
})

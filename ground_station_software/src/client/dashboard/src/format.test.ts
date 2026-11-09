import { describe, expect, it } from 'vitest'
import { clockTime, formatValue, humanize } from './format'
import { commandInfo, connectionInfo, LOSS_BAD_PCT, LOSS_WARN_PCT, lossTone, slotState } from './health'

describe('humanize', () => {
  it('turns wire names into sentence-case labels with acronyms', () => {
    expect(humanize('packet_id')).toBe('Packet ID')
    expect(humanize('utc_time')).toBe('UTC time')
    expect(humanize('graph_1_type')).toBe('Graph 1 type')
    expect(humanize('latitude')).toBe('Latitude')
    expect(humanize('peripheral_count')).toBe('Peripheral count')
  })

  it('leaves placeholder names untouched', () => {
    expect(humanize('[field_1]')).toBe('[field_1]')
  })
})

describe('formatValue', () => {
  it('formats numbers and shows a dash for missing values', () => {
    expect(formatValue(1.23456, 3)).toBe('1.235')
    expect(formatValue(null)).toBe('—')
    expect(formatValue(undefined)).toBe('—')
    expect(formatValue(Number.NaN)).toBe('—')
  })
})

describe('clockTime', () => {
  it('converts a performance timestamp to wall-clock time', () => {
    const origin = new Date(2026, 9, 21, 14, 3, 0).getTime()
    expect(clockTime(27_000, origin)).toMatch(/14:03:27/)
  })
})

describe('health', () => {
  it('maps connection status to a label and tone', () => {
    expect(connectionInfo('open')).toEqual({ label: 'Live', tone: 'good' })
    expect(connectionInfo('reconnecting').tone).toBe('bad')
  })

  it('colours loss by threshold', () => {
    expect(lossTone(0)).toBe('good')
    expect(lossTone(LOSS_WARN_PCT)).toBe('warn')
    expect(lossTone(LOSS_BAD_PCT)).toBe('bad')
  })

  it('derives slot state from connection and rate', () => {
    expect(slotState('open', 10)).toBe('live')
    expect(slotState('open', 0)).toBe('no-data')
    expect(slotState('reconnecting', 10)).toBe('offline')
  })

  it('labels command statuses, passing unknown ones through', () => {
    expect(commandInfo('not_sent')).toEqual({ label: 'Not sent', tone: 'warn' })
    expect(commandInfo('pending').label).toBe('Waiting for ack')
    expect(commandInfo('something_new')).toEqual({ label: 'something_new', tone: 'neutral' })
  })
})

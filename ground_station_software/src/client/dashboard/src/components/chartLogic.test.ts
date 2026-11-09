import { describe, expect, it } from 'vitest'
import { PACKET_FIELDS, type PacketData, type ReservedTelemetry } from '../contract'
import { FLAT_PAD, GAP_BREAK_S, toXY, visibleYRange } from './chartLogic'

const FIELD = PACKET_FIELDS[1]

// Reserved messages at the given t_ms values; the charted field's value is 10 * index.
function batch(tMs: number[], seqStart = 0): ReservedTelemetry[] {
  return tMs.map((t_ms, i) => ({
    type: 'telemetry',
    seq: seqStart + i,
    t_ms,
    slot: 'reserved',
    peripheral_id: 0,
    src_seq: seqStart + i,
    data: Object.fromEntries(PACKET_FIELDS.map((f) => [f, f === FIELD ? i * 10 : 0])) as PacketData,
  }))
}

const nulls = (y: (number | null)[]) => y.filter((v) => v === null).length

describe('toXY', () => {
  it('converts a normal batch to seconds and field values', () => {
    expect(toXY(batch([1000, 1100, 1200]), FIELD, null)).toEqual({
      x: [1, 1.1, 1.2],
      y: [0, 10, 20],
      reset: false,
    })
  })

  it('returns empty arrays for an empty batch', () => {
    expect(toXY([], FIELD, 5)).toEqual({ x: [], y: [], reset: false })
  })

  it('keeps only the tail after a backwards step inside the batch', () => {
    const out = toXY(batch([5000, 5100, 0, 100]), FIELD, 4.9)
    expect(out).toEqual({ x: [0, 0.1], y: [20, 30], reset: true })
  })

  it('flags a reset when the batch starts below lastX', () => {
    const out = toXY(batch([0, 100]), FIELD, 42)
    expect(out).toEqual({ x: [0, 0.1], y: [0, 10], reset: true })
  })

  it('inserts one null point at the midpoint of a gap inside the batch', () => {
    const out = toXY(batch([1000, 1500, 3500]), FIELD, null)
    expect(out.x).toEqual([1, 1.5, 2.5, 3.5])
    expect(out.y).toEqual([0, 10, null, 20])
    expect(out.reset).toBe(false)
  })

  it('inserts no break when points are within GAP_BREAK_S', () => {
    const step = GAP_BREAK_S * 1000 // exactly the threshold: not a break
    const out = toXY(batch([0, step, 2 * step]), FIELD, null)
    expect(nulls(out.y)).toBe(0)
  })

  it('inserts a break across batches using lastX', () => {
    const out = toXY(batch([10_000, 10_100]), FIELD, 5)
    expect(out.x).toEqual([7.5, 10, 10.1])
    expect(out.y).toEqual([null, 0, 10])
  })

  it('does not insert a break at a reset', () => {
    // lastX 100 s -> first point 0 s is a reset, not an outage.
    const out = toXY(batch([0, 100, 200]), FIELD, 100)
    expect(out.reset).toBe(true)
    expect(nulls(out.y)).toBe(0)
    expect(out.x).toEqual([0, 0.1, 0.2])
  })
})

describe('visibleYRange', () => {
  it('ignores points outside the x window (bounds inclusive)', () => {
    const xs = [0, 5, 7, 10, 15]
    const ys = [-100, 1, 2, 3, 200]
    expect(visibleYRange(xs, ys, 5, 10, 0)).toEqual([1, 3])
    // padFrac 0.5 of span 2 -> pad 1 each side.
    expect(visibleYRange(xs, ys, 5, 10, 0.5)).toEqual([0, 4])
  })

  it('ignores null break points', () => {
    expect(visibleYRange([1, 2, 3], [1, null, 3], 0, 10, 0)).toEqual([1, 3])
  })

  it('gives a flat signal a nonzero range', () => {
    const range = visibleYRange([1, 2, 3], [5, 5, 5], 0, 10, 0.05)
    expect(range).toEqual([5 - FLAT_PAD, 5 + FLAT_PAD])
    expect(range![1] - range![0]).toBeGreaterThan(0)
  })

  it('returns null when no points are visible', () => {
    expect(visibleYRange([1, 2], [1, 2], 5, 10, 0.05)).toBeNull()
    expect(visibleYRange([6, 7], [null, null], 5, 10, 0.05)).toBeNull()
    expect(visibleYRange([], [], 0, 10, 0.05)).toBeNull()
  })
})

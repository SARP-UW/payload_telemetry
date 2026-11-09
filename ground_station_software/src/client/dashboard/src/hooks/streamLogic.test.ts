import { describe, expect, it } from 'vitest'
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  backoffDelay,
  INITIAL_GAP_STATE,
  INITIAL_SLOT_GAPS,
  lossPercent,
  messageRate,
  nextGapState,
  nextSlotGaps,
  readSince,
  resetSlotBaselines,
  wsUrl,
} from './streamLogic'

function runGaps(seqs: number[]) {
  return seqs.reduce(nextGapState, INITIAL_GAP_STATE)
}

describe('nextGapState', () => {
  it('counts no gaps for an in-order stream', () => {
    expect(runGaps([0, 1, 2, 3, 4])).toEqual({ lastSeq: 4, gaps: 0 })
  })

  it('counts each missing seq', () => {
    expect(runGaps([1, 2, 5])).toEqual({ lastSeq: 5, gaps: 2 })
    expect(runGaps([1, 2, 5, 6, 8])).toEqual({ lastSeq: 8, gaps: 3 })
  })

  it('treats seq going backwards as a restart without counting a gap', () => {
    expect(runGaps([48, 49, 50, 0, 1])).toEqual({ lastSeq: 1, gaps: 0 })
    // Gaps counted before the restart are kept; the new baseline starts clean.
    expect(runGaps([1, 3, 0, 1, 2])).toEqual({ lastSeq: 2, gaps: 1 })
  })
})

describe('backoffDelay', () => {
  it('grows exponentially', () => {
    const max = () => 1
    const min = () => 0
    expect([0, 1, 2, 3].map((a) => backoffDelay(a, max))).toEqual([1000, 2000, 4000, 8000])
    expect([0, 1, 2, 3].map((a) => backoffDelay(a, min))).toEqual([500, 1000, 2000, 4000])
    expect(backoffDelay(0, max)).toBe(BACKOFF_BASE_MS)
  })

  it('is capped', () => {
    for (const attempt of [4, 10, 1000]) {
      expect(backoffDelay(attempt, () => 1)).toBe(BACKOFF_CAP_MS)
      expect(backoffDelay(attempt, () => 0)).toBe(BACKOFF_CAP_MS / 2)
    }
  })

  it('stays within [exp/2, exp] with real randomness', () => {
    for (let i = 0; i < 100; i++) {
      const d = backoffDelay(2)
      expect(d).toBeGreaterThanOrEqual(2000)
      expect(d).toBeLessThanOrEqual(4000)
    }
  })
})

describe('readSince', () => {
  // Ten messages ever received, all still retained: history[i] is cursor i.
  const full = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

  it('returns messages after the cursor and advances it', () => {
    expect(readSince(full, 10, 7)).toEqual({ messages: [7, 8, 9], cursor: 10 })
    expect(readSince(full, 10, 0)).toEqual({ messages: full, cursor: 10 })
  })

  it('returns nothing when there are no new messages', () => {
    expect(readSince(full, 10, 10)).toEqual({ messages: [], cursor: 10 })
    expect(readSince([], 0, 0)).toEqual({ messages: [], cursor: 0 })
  })

  it('returns everything retained when trimming passed the cursor', () => {
    // 10 received, only the last 5 retained (cursors 5..9); caller last read at 2.
    const trimmed = [5, 6, 7, 8, 9]
    expect(readSince(trimmed, 10, 2)).toEqual({ messages: trimmed, cursor: 10 })
  })

  it('treats a cursor ahead of the total as a reset', () => {
    expect(readSince([0, 1, 2], 3, 50)).toEqual({ messages: [0, 1, 2], cursor: 3 })
  })
})

describe('wsUrl', () => {
  it('uses ws for http and wss for https', () => {
    expect(wsUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws')
    expect(wsUrl({ protocol: 'https:', host: 'gs.example:443' })).toBe('wss://gs.example:443/ws')
  })
})

describe('lossPercent', () => {
  it('is 0 when nothing has been received', () => {
    expect(lossPercent(0, 0)).toBe(0)
  })

  it('is 100 when only gaps have been seen', () => {
    expect(lossPercent(0, 5)).toBe(100)
  })

  it('is gaps / (received + gaps)', () => {
    expect(lossPercent(90, 10)).toBe(10)
    expect(lossPercent(100, 0)).toBe(0)
  })
})

describe('messageRate', () => {
  it('is 0 with no timestamps', () => {
    expect(messageRate([], 1000, 2000)).toBe(0)
  })

  it('counts timestamps in the window per second', () => {
    // 20 receipts 100 ms apart ending at now: 10 msgs/s over a 2 s window.
    const now = 10_000
    const times = Array.from({ length: 20 }, (_, i) => now - i * 100)
    expect(messageRate(times, now, 2000)).toBe(10)
  })

  it('excludes timestamps older than the window', () => {
    expect(messageRate([1000, 2000, 9000, 9500], 10_000, 2000)).toBe(1)
  })

  it('treats the window start as exclusive', () => {
    // 8000 is exactly now - windowMs: excluded. 8001 is inside.
    expect(messageRate([8000, 8001], 10_000, 2000)).toBe(0.5)
  })
})
describe('nextSlotGaps', () => {
  it('tracks each slot independently', () => {
    let state = INITIAL_SLOT_GAPS
    for (const [slot, srcSeq] of [
      ['reserved', 0],
      ['user1', 0],
      ['reserved', 1],
      ['user1', 3],
      ['reserved', 2],
    ] as const) {
      state = nextSlotGaps(state, slot, srcSeq)
    }
    expect(state.reserved).toEqual({ lastSeq: 2, gaps: 0 })
    expect(state.user1).toEqual({ lastSeq: 3, gaps: 2 })
    expect(state.user2).toEqual(INITIAL_GAP_STATE)
  })

  it('ignores a null src_seq', () => {
    const state = nextSlotGaps(INITIAL_SLOT_GAPS, 'user2', 5)
    expect(nextSlotGaps(state, 'user2', null)).toBe(state)
  })

  it('resets baselines but keeps counts', () => {
    const state = nextSlotGaps(nextSlotGaps(INITIAL_SLOT_GAPS, 'user1', 0), 'user1', 4)
    const reset = resetSlotBaselines(state)
    expect(reset.user1).toEqual({ lastSeq: null, gaps: 3 })
    // After a reset, a jump is a new baseline, not a gap.
    expect(nextSlotGaps(reset, 'user1', 100).user1).toEqual({ lastSeq: 100, gaps: 3 })
  })
})

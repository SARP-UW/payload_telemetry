// Pure chart data shaping for LiveChart. No Plotly, no DOM.

// The parts of a telemetry message a chart needs (any slot).
export interface ChartPoint {
  t_ms: number
  data: Readonly<Record<string, number>>
}

// Consecutive points further apart than this (seconds) get a line break.
export const GAP_BREAK_S = 1.0 // [confirm: must exceed normal inter-packet interval at flight rate]

// Fraction of the visible y span added above and below.
export const PAD_FRAC = 0.05 // dev default

// Padding (field units) above and below a flat signal, so the range is never zero width.
export const FLAT_PAD = 1 // dev default

export interface XYBatch {
  x: number[]
  y: (number | null)[]
  reset: boolean
}

/**
 * Convert a batch of messages to x/y arrays for one field. x is t_ms in
 * seconds (never utc_time).
 *
 * - reset: if x goes backwards (inside the batch, or the first point is below
 *   lastX) the server restarted. Only points from the last backwards step on
 *   are returned and the caller should replace, not extend, its trace.
 * - breaks: when consecutive x values (including lastX -> first point, unless
 *   reset) differ by more than GAP_BREAK_S, a {x: midpoint, y: null} point is
 *   inserted so Plotly breaks the line across the outage.
 */
export function toXY(messages: readonly ChartPoint[], field: string, lastX: number | null): XYBatch {
  let start = 0
  let reset = false
  for (let i = 0; i < messages.length; i++) {
    const prev = i === 0 ? lastX : messages[i - 1].t_ms / 1000
    if (prev !== null && messages[i].t_ms / 1000 < prev) {
      start = i
      reset = true
    }
  }

  const x: number[] = []
  const y: (number | null)[] = []
  let prevX = reset ? null : lastX
  for (let i = start; i < messages.length; i++) {
    const xi = messages[i].t_ms / 1000
    if (prevX !== null && xi - prevX > GAP_BREAK_S) {
      x.push((prevX + xi) / 2)
      y.push(null)
    }
    x.push(xi)
    y.push(messages[i].data[field])
    prevX = xi
  }

  return { x, y, reset }
}

/**
 * y-axis range covering the points with xMin <= x <= xMax and y !== null,
 * padded by padFrac of the span on each side (FLAT_PAD for a flat signal).
 * Returns null when no point is visible, meaning: leave the axis as is.
 */
export function visibleYRange(
  xs: readonly number[],
  ys: readonly (number | null)[],
  xMin: number,
  xMax: number,
  padFrac: number,
): [number, number] | null {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i]
    if (y === null || xs[i] < xMin || xs[i] > xMax) continue
    if (y < min) min = y
    if (y > max) max = y
  }
  if (min > max) return null

  const pad = max === min ? FLAT_PAD : (max - min) * padFrac
  return [min - pad, max + pad]
}

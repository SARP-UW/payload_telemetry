// Display formatting shared by the panels. Pure, no React.

const ACRONYMS = new Set(['id', 'utc', 'gps', 'rfic', 'tx', 'rx', 'usb', 'cmd'])

/**
 * Turn a wire name into a readable label: 'packet_id' -> 'Packet ID',
 * 'utc_time' -> 'UTC time', 'graph_1_type' -> 'Graph 1 type'.
 * Placeholder names like '[field_1]' are left as-is so they stay obviously TBD.
 */
export function humanize(name: string): string {
  if (name.startsWith('[')) return name
  const words = name.split(/[_\s]+/).filter(Boolean)
  return words
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) return lower.toUpperCase()
      return i === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower
    })
    .join(' ')
}

/** Fixed-decimal number, or an em dash when there is no value. */
export function formatValue(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toFixed(digits)
}

/** Wall-clock time for a performance.now() timestamp, e.g. '14:03:27'. */
export function clockTime(perfMs: number, timeOrigin: number = performance.timeOrigin): string {
  return new Date(timeOrigin + perfMs).toLocaleTimeString([], { hour12: false })
}

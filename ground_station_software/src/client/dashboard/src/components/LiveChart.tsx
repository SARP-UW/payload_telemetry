import type { Layout } from 'plotly.js-dist-min'
import { memo, useEffect, useRef } from 'react'
import type { Slot, TelemetryMessage } from '../contract'
import { humanize } from '../format'
import { HISTORY_LIMIT } from '../hooks/useWebSocket'
import type { ReadResult } from '../hooks/streamLogic'
import { PAD_FRAC, toXY, visibleYRange, type ChartPoint } from './chartLogic'
import { loadPlotly, type PlotlyApi } from './plotly'

const DEFAULT_WINDOW_SECONDS = 30 // [confirm display window]

// Memory cap per trace only; the visible window is set by xaxis.range.
const MAX_POINTS = HISTORY_LIMIT

type Range = [number, number]

interface ChartTheme {
  text: string
  grid: string
  line: string
}

/**
 * Chart colours from the page's CSS variables, read once when the chart is
 * created. Without a stylesheet the charts fall back to black and grey.
 */
function readTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  return { text: v('--muted', '#000000'), grid: v('--border', '#d9d9d9'), line: v('--accent', '#000000') }
}

/**
 * The single source of every axis setting. relayout replaces whole axis
 * objects (the bundled types don't allow 'xaxis.range' paths), so newPlot and
 * every relayout build their axes here and nothing gets dropped. A null
 * yRange omits yaxis entirely, leaving that axis as it is.
 */
function axesLayout(
  theme: ChartTheme,
  compact: boolean,
  yTitle: string | null,
  xRange?: Range,
  yRange?: Range | null,
): Partial<Layout> {
  const axis = { color: theme.text, gridcolor: theme.grid, zerolinecolor: theme.grid }
  const layout: Partial<Layout> = {
    xaxis: {
      ...axis,
      ...(!compact && { title: { text: 'Time since server start (s)' } }),
      ...(xRange && { range: xRange }),
    },
  }
  if (yRange !== null) {
    layout.yaxis = {
      ...axis,
      ...(compact && yTitle && { title: { text: humanize(yTitle) } }),
      ...(yRange && { range: yRange }),
    }
  }
  return layout
}

interface LiveChartProps {
  slot: Slot
  field: string | null // null = first field that arrives for the slot
  getMessagesSince: (cursor: number) => ReadResult<TelemetryMessage>
  windowSeconds?: number
  height?: number // fixed height in px; omit to fill the container
  compact?: boolean // no title, tight margins, field name on the y axis
}

/**
 * One live line chart for one field of one slot. Data flows from the stream's
 * ref buffer straight into Plotly on its own rAF loop; React never re-renders
 * this component on new data. Follows its container's size.
 */
function LiveChart({
  slot,
  field,
  getMessagesSince,
  windowSeconds = DEFAULT_WINDOW_SECONDS,
  height,
  compact = false,
}: LiveChartProps) {
  const divRef = useRef<HTMLDivElement>(null)
  // Read inside the rAF loop so changing the window doesn't rebuild the chart.
  const windowRef = useRef(windowSeconds)

  useEffect(() => {
    windowRef.current = windowSeconds
  }, [windowSeconds])

  useEffect(() => {
    const div = divRef.current
    if (!div) return

    const theme = readTheme()
    let disposed = false
    let rafId = 0
    let resizeRaf = 0
    let plotly: PlotlyApi | null = null
    let cursor = 0
    let lastX: number | null = null
    let resolved: string | null = field
    // Mirror of the plotted trace (including null break points), kept in step
    // with extendTraces' MAX_POINTS trimming, so the y range can be computed
    // without reading Plotly's internal data.
    let xs: number[] = []
    let ys: (number | null)[] = []

    function tick() {
      if (disposed || !plotly || !div) return
      const { messages, cursor: next } = getMessagesSince(cursor)
      cursor = next
      const inSlot = messages.filter((m) => m.slot === slot)

      if (resolved === null) {
        const first = inSlot.find((m) => Object.keys(m.data).length > 0)
        if (first) {
          resolved = Object.keys(first.data)[0]
          plotly.relayout(div, axesLayout(theme, compact, resolved))
        }
      }

      const name = resolved
      const points: ChartPoint[] =
        name === null ? [] : inSlot.filter((m) => typeof (m.data as Record<string, number>)[name] === 'number')

      if (name !== null && points.length > 0) {
        const { x, y, reset } = toXY(points, name, lastX)
        if (x.length > 0) {
          if (reset) {
            plotly.restyle(div, { x: [x], y: [y] }, [0])
            xs = [...x]
            ys = [...y]
          } else {
            plotly.extendTraces(div, { x: [x], y: [y] }, [0], MAX_POINTS)
            xs.push(...x)
            ys.push(...y)
            if (xs.length > MAX_POINTS) {
              xs.splice(0, xs.length - MAX_POINTS)
              ys.splice(0, ys.length - MAX_POINTS)
            }
          }
          // Last point is always a real sample (breaks are only inserted before one).
          lastX = x[x.length - 1]
          const xRange: Range = [lastX - windowRef.current, lastX]
          const yRange = visibleYRange(xs, ys, xRange[0], xRange[1], PAD_FRAC)
          plotly.relayout(div, axesLayout(theme, compact, name, xRange, yRange))
        }
      }

      rafId = requestAnimationFrame(tick)
    }

    // Plotly only tracks window resizes; modules resize on their own.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        if (plotly && !disposed) plotly.Plots.resize(div)
      })
    })
    observer.observe(div)

    loadPlotly().then(async (P) => {
      if (disposed) return
      await P.newPlot(
        div,
        [{ x: [], y: [], mode: 'lines', type: 'scatter', line: { color: theme.line, width: compact ? 1.5 : 2 } }],
        {
          ...(!compact && {
            title: { text: humanize(field ?? 'auto'), x: 0.02, xanchor: 'left', font: { size: 14, color: theme.text } },
          }),
          ...(height ? { height } : { autosize: true }),
          margin: compact ? { t: 6, r: 8, b: 22, l: 46 } : { t: 36, r: 16, b: 44, l: 56 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { color: theme.text, size: compact ? 10 : 11 },
          showlegend: false,
          ...axesLayout(theme, compact, resolved),
        },
        { displayModeBar: false },
      )
      if (disposed) {
        P.purge(div)
        return
      }
      plotly = P
      rafId = requestAnimationFrame(tick)
    })

    return () => {
      disposed = true
      observer.disconnect()
      cancelAnimationFrame(rafId)
      cancelAnimationFrame(resizeRaf)
      if (plotly) plotly.purge(div)
    }
  }, [slot, field, getMessagesSince, height, compact])

  return (
    <div
      ref={divRef}
      className={height ? 'chart' : 'chart chart-fill'}
      role="img"
      aria-label={`Live chart of ${humanize(field ?? 'auto')} (${slot})`}
    />
  )
}

export default memo(LiveChart)

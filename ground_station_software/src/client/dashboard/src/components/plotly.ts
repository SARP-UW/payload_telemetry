// The only place Plotly is imported. Dynamic import keeps it in its own chunk.
// Types ship with plotly.js-dist-min itself (lib/index.d.ts).

import type Plotly from 'plotly.js-dist-min'

export type PlotlyApi = typeof Plotly

let plotlyPromise: Promise<PlotlyApi> | null = null

export function loadPlotly(): Promise<PlotlyApi> {
  if (plotlyPromise === null) {
    plotlyPromise = import('plotly.js-dist-min').then((mod) => mod.default)
  }
  return plotlyPromise
}

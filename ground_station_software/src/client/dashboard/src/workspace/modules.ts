// Module list for the workspace: what's on the canvas and the operations on it.
// Pure, no React. Every operation returns a new state or an error message.

import { PACKET_FIELDS, SLOTS, type Slot } from '../contract'
import { RESERVED_CHART_FIELDS, SLOT_SHORT, USER_SLOTS } from '../lanes'
import {
  clampRect,
  collisions,
  DEFAULT_H,
  DEFAULT_W,
  findFreeSpot,
  GRID_COLS,
  GRID_ROWS,
  inBounds,
  MIN_H,
  MIN_W,
  type Rect,
} from './layoutLogic'

export const DEFAULT_WINDOW_S = 30 // [confirm display window]
export const MIN_WINDOW_S = 5
export const MAX_WINDOW_S = 600

export const STORAGE_KEY = 'gs.workspace.v1'

export interface GraphModule {
  id: string // 'g1', 'g2', ... short so it is easy to type
  kind: 'graph'
  slot: Slot
  field: string | null // null = first numeric field that arrives for the slot
  windowS: number
  rect: Rect
}

export interface WorkspaceState {
  modules: GraphModule[]
  nextId: number
}

export type OpResult = { ok: true; state: WorkspaceState; message: string } | { ok: false; message: string }

const fail = (message: string): OpResult => ({ ok: false, message })

export function describeModule(m: GraphModule): string {
  return `${m.id} ${SLOT_SHORT[m.slot]} ${m.field ?? 'auto'} ${m.windowS}s @${m.rect.x},${m.rect.y} ${m.rect.w}x${m.rect.h}`
}

/** Reserved charts on top, one auto graph per user slot below; fills the canvas. */
export function defaultWorkspace(): WorkspaceState {
  const halfW = GRID_COLS / 2
  const halfH = GRID_ROWS / 2
  const modules: GraphModule[] = []
  const add = (slot: Slot, field: string | null, x: number, y: number) =>
    modules.push({
      id: `g${modules.length + 1}`,
      kind: 'graph',
      slot,
      field,
      windowS: DEFAULT_WINDOW_S,
      rect: { x, y, w: halfW, h: halfH },
    })
  RESERVED_CHART_FIELDS.slice(0, 2).forEach((field, i) => add('reserved', field, i * halfW, 0))
  USER_SLOTS.slice(0, 2).forEach((slot, i) => add(slot, null, i * halfW, halfH))
  return { modules, nextId: modules.length + 1 }
}

export function findModule(state: WorkspaceState, id: string): GraphModule | undefined {
  return state.modules.find((m) => m.id === id)
}

function replace(state: WorkspaceState, id: string, patch: Partial<GraphModule>): WorkspaceState {
  return { ...state, modules: state.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)) }
}

/** Reserved fields must exist in the packet; user slot fields are free-form until defined. */
export function checkField(slot: Slot, field: string | null): string | null {
  if (field === null || slot !== 'reserved') return null
  return (PACKET_FIELDS as readonly string[]).includes(field)
    ? null
    : `Unknown Reserved field '${field}'. Try: fields reserved`
}

export function addGraph(state: WorkspaceState, slot: Slot, field: string | null): OpResult {
  const fieldError = checkField(slot, field)
  if (fieldError) return fail(fieldError)
  const rect = findFreeSpot(state.modules, DEFAULT_W, DEFAULT_H) ?? findFreeSpot(state.modules, MIN_W, MIN_H)
  if (!rect) return fail('No free space on the canvas. Remove or shrink a module first.')
  const id = `g${state.nextId}`
  const mod: GraphModule = { id, kind: 'graph', slot, field, windowS: DEFAULT_WINDOW_S, rect }
  return {
    ok: true,
    state: { modules: [...state.modules, mod], nextId: state.nextId + 1 },
    message: `Added ${describeModule(mod)}`,
  }
}

export function removeModule(state: WorkspaceState, id: string): OpResult {
  if (!findModule(state, id)) return fail(`No module '${id}'. Try: list`)
  return { ok: true, state: { ...state, modules: state.modules.filter((m) => m.id !== id) }, message: `Removed ${id}` }
}

export function setSource(state: WorkspaceState, id: string, slot: Slot, field: string | null): OpResult {
  const mod = findModule(state, id)
  if (!mod) return fail(`No module '${id}'. Try: list`)
  const fieldError = checkField(slot, field)
  if (fieldError) return fail(fieldError)
  return { ok: true, state: replace(state, id, { slot, field }), message: `${id} source: ${SLOT_SHORT[slot]} ${field ?? 'auto'}` }
}

export function setWindow(state: WorkspaceState, id: string, seconds: number): OpResult {
  if (!findModule(state, id)) return fail(`No module '${id}'. Try: list`)
  if (!Number.isFinite(seconds) || seconds < MIN_WINDOW_S || seconds > MAX_WINDOW_S) {
    return fail(`Window must be ${MIN_WINDOW_S} to ${MAX_WINDOW_S} seconds`)
  }
  const windowS = Math.round(seconds)
  return { ok: true, state: replace(state, id, { windowS }), message: `${id} window: ${windowS}s` }
}

/** Move or resize; refused if it would overlap another module. */
export function setRect(state: WorkspaceState, id: string, rect: Rect): OpResult {
  const mod = findModule(state, id)
  if (!mod) return fail(`No module '${id}'. Try: list`)
  const next = clampRect(rect)
  const hits = collisions(state.modules, next, id)
  if (hits.length > 0) return fail(`${id} would overlap ${hits.join(', ')}`)
  return {
    ok: true,
    state: replace(state, id, { rect: next }),
    message: `${id} at ${next.x},${next.y} size ${next.w}x${next.h}`,
  }
}

export function listModules(state: WorkspaceState): string {
  if (state.modules.length === 0) return 'No modules'
  return state.modules.map(describeModule).join(' | ')
}

// ---------- persistence ----------

function isSlot(v: unknown): v is Slot {
  return typeof v === 'string' && (SLOTS as readonly string[]).includes(v)
}

function parseModule(v: unknown): GraphModule | null {
  if (typeof v !== 'object' || v === null) return null
  const m = v as Record<string, unknown>
  const r = m.rect as Record<string, unknown> | undefined
  if (typeof m.id !== 'string' || !/^g\d+$/.test(m.id) || m.kind !== 'graph' || !isSlot(m.slot)) return null
  if (m.field !== null && typeof m.field !== 'string') return null
  if (checkField(m.slot, m.field as string | null)) return null
  if (typeof m.windowS !== 'number' || m.windowS < MIN_WINDOW_S || m.windowS > MAX_WINDOW_S) return null
  if (!r || typeof r !== 'object') return null
  const rect = { x: r.x, y: r.y, w: r.w, h: r.h } as Rect
  if (!inBounds(rect)) return null
  return { id: m.id, kind: 'graph', slot: m.slot, field: m.field as string | null, windowS: m.windowS, rect }
}

/** Restore a saved workspace. Anything invalid (or overlapping) returns null so the caller uses the default. */
export function parseWorkspace(raw: string | null): WorkspaceState | null {
  if (!raw) return null
  let doc: unknown
  try {
    doc = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof doc !== 'object' || doc === null) return null
  const { modules, nextId } = doc as Record<string, unknown>
  if (!Array.isArray(modules) || typeof nextId !== 'number' || !Number.isInteger(nextId)) return null
  const parsed: GraphModule[] = []
  for (const item of modules) {
    const mod = parseModule(item)
    if (!mod || collisions(parsed, mod.rect).length > 0 || parsed.some((p) => p.id === mod.id)) return null
    parsed.push(mod)
  }
  const maxId = parsed.reduce((n, m) => Math.max(n, Number(m.id.slice(1))), 0)
  return { modules: parsed, nextId: Math.max(nextId, maxId + 1) }
}

export function serializeWorkspace(state: WorkspaceState): string {
  return JSON.stringify(state)
}

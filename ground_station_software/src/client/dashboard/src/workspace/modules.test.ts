import { describe, expect, it } from 'vitest'
import { PACKET_FIELDS } from '../contract'
import { collisions, GRID_COLS, GRID_ROWS } from './layoutLogic'
import {
  addGraph,
  defaultWorkspace,
  MAX_WINDOW_S,
  parseWorkspace,
  removeModule,
  serializeWorkspace,
  setRect,
  setSource,
  setWindow,
  type WorkspaceState,
} from './modules'

const ok = (r: ReturnType<typeof addGraph>): WorkspaceState => {
  if (!r.ok) throw new Error(r.message)
  return r.state
}

describe('defaultWorkspace', () => {
  it('fills the grid with non-overlapping modules', () => {
    const ws = defaultWorkspace()
    expect(ws.modules.length).toBeGreaterThan(0)
    const area = ws.modules.reduce((n, m) => n + m.rect.w * m.rect.h, 0)
    expect(area).toBe(GRID_COLS * GRID_ROWS)
    for (const m of ws.modules) expect(collisions(ws.modules, m.rect, m.id)).toEqual([])
    expect(ws.modules.filter((m) => m.slot !== 'reserved').every((m) => m.field === null)).toBe(true)
  })
})

describe('addGraph and removeModule', () => {
  it('adds into free space with the next id', () => {
    const empty: WorkspaceState = { modules: [], nextId: 7 }
    const ws = ok(addGraph(empty, 'user1', null))
    expect(ws.modules[0]).toMatchObject({ id: 'g7', slot: 'user1', field: null, rect: { x: 0, y: 0 } })
    expect(ws.nextId).toBe(8)
  })

  it('refuses when the canvas is full', () => {
    const r = addGraph(defaultWorkspace(), 'reserved', PACKET_FIELDS[0])
    expect(r.ok).toBe(false)
  })

  it('rejects unknown Reserved fields but accepts any user field', () => {
    const empty: WorkspaceState = { modules: [], nextId: 1 }
    expect(addGraph(empty, 'reserved', 'not_a_field').ok).toBe(false)
    expect(addGraph(empty, 'user2', 'anything').ok).toBe(true)
  })

  it('removes by id and reports unknown ids', () => {
    const ws = defaultWorkspace()
    const r = removeModule(ws, 'g1')
    expect(r.ok && r.state.modules.some((m) => m.id === 'g1')).toBe(false)
    expect(removeModule(ws, 'g99').ok).toBe(false)
  })
})

describe('setSource, setWindow, setRect', () => {
  it('changes the source', () => {
    const r = setSource(defaultWorkspace(), 'g1', 'user2', 'x')
    expect(r.ok && r.state.modules[0]).toMatchObject({ slot: 'user2', field: 'x' })
  })

  it('bounds the window', () => {
    expect(setWindow(defaultWorkspace(), 'g1', 60).ok).toBe(true)
    expect(setWindow(defaultWorkspace(), 'g1', MAX_WINDOW_S + 1).ok).toBe(false)
  })

  it('refuses a move that overlaps another module', () => {
    const ws = defaultWorkspace()
    const g1 = ws.modules[0]
    expect(setRect(ws, 'g1', { ...g1.rect, x: g1.rect.x + 1 }).ok).toBe(false)
    const shrunk = setRect(ws, 'g1', { ...g1.rect, w: 3 })
    expect(shrunk.ok).toBe(true)
  })
})

describe('parseWorkspace', () => {
  it('round-trips a saved workspace', () => {
    const ws = defaultWorkspace()
    expect(parseWorkspace(serializeWorkspace(ws))).toEqual(ws)
  })

  it('rejects anything invalid so the default is used', () => {
    expect(parseWorkspace(null)).toBeNull()
    expect(parseWorkspace('not json')).toBeNull()
    const ws = defaultWorkspace()
    const overlapping = { ...ws, modules: [ws.modules[0], { ...ws.modules[1], rect: ws.modules[0].rect }] }
    expect(parseWorkspace(JSON.stringify(overlapping))).toBeNull()
    const outOfBounds = { ...ws, modules: [{ ...ws.modules[0], rect: { x: 10, y: 0, w: 6, h: 6 } }] }
    expect(parseWorkspace(JSON.stringify(outOfBounds))).toBeNull()
    const badField = { ...ws, modules: [{ ...ws.modules[0], field: 'nope' }] }
    expect(parseWorkspace(JSON.stringify(badField))).toBeNull()
  })

  it('never reuses an id', () => {
    const ws = { ...defaultWorkspace(), nextId: 1 }
    expect(parseWorkspace(JSON.stringify(ws))?.nextId).toBe(ws.modules.length + 1)
  })
})

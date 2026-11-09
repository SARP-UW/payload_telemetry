import { describe, expect, it } from 'vitest'
import {
  clampRect,
  collisions,
  dragRect,
  findFreeSpot,
  GRID_COLS,
  GRID_ROWS,
  inBounds,
  MIN_H,
  MIN_W,
  overlaps,
  pxToCells,
  rectStyle,
} from './layoutLogic'

describe('clampRect', () => {
  it('snaps to cells and keeps the rect inside the grid', () => {
    expect(clampRect({ x: 10.4, y: -3, w: 6, h: 4 })).toEqual({ x: GRID_COLS - 6, y: 0, w: 6, h: 4 })
    expect(clampRect({ x: 0, y: 0, w: 1, h: 99 })).toEqual({ x: 0, y: 0, w: MIN_W, h: GRID_ROWS })
  })
})

describe('inBounds', () => {
  it('accepts whole-cell rects inside the grid only', () => {
    expect(inBounds({ x: 0, y: 0, w: GRID_COLS, h: GRID_ROWS })).toBe(true)
    expect(inBounds({ x: 1, y: 0, w: GRID_COLS, h: 2 })).toBe(false)
    expect(inBounds({ x: 0, y: 0, w: MIN_W - 1, h: 2 })).toBe(false)
    expect(inBounds({ x: 0.5, y: 0, w: 2, h: 2 })).toBe(false)
  })
})

describe('overlaps and collisions', () => {
  const a = { x: 0, y: 0, w: 4, h: 4 }
  it('treats touching edges as not overlapping', () => {
    expect(overlaps(a, { x: 4, y: 0, w: 2, h: 2 })).toBe(false)
    expect(overlaps(a, { x: 3, y: 3, w: 2, h: 2 })).toBe(true)
  })

  it('lists colliding ids, ignoring the item being moved', () => {
    const items = [
      { id: 'g1', rect: a },
      { id: 'g2', rect: { x: 4, y: 0, w: 4, h: 4 } },
    ]
    expect(collisions(items, { x: 2, y: 0, w: 4, h: 2 })).toEqual(['g1', 'g2'])
    expect(collisions(items, { x: 2, y: 0, w: 2, h: 2 }, 'g1')).toEqual([])
  })
})

describe('findFreeSpot', () => {
  it('finds the first free spot scanning rows, or null when full', () => {
    const items = [{ id: 'g1', rect: { x: 0, y: 0, w: 4, h: 4 } }]
    expect(findFreeSpot(items, 4, 4)).toEqual({ x: 4, y: 0, w: 4, h: 4 })
    const full = [{ id: 'g1', rect: { x: 0, y: 0, w: GRID_COLS, h: GRID_ROWS } }]
    expect(findFreeSpot(full, MIN_W, MIN_H)).toBeNull()
  })
})

describe('dragRect', () => {
  const orig = { x: 2, y: 2, w: 4, h: 4 }
  it('moves without changing size and stops at the edge', () => {
    expect(dragRect(orig, 'move', 1, -1)).toEqual({ x: 3, y: 1, w: 4, h: 4 })
    expect(dragRect(orig, 'move', 100, 100)).toEqual({ x: GRID_COLS - 4, y: GRID_ROWS - 4, w: 4, h: 4 })
  })

  it('resizes from the bottom-right, between the minimum and the grid edge', () => {
    expect(dragRect(orig, 'resize', 2, 1)).toEqual({ x: 2, y: 2, w: 6, h: 5 })
    expect(dragRect(orig, 'resize', -10, -10)).toEqual({ x: 2, y: 2, w: MIN_W, h: MIN_H })
    expect(dragRect(orig, 'resize', 100, 100)).toEqual({ x: 2, y: 2, w: GRID_COLS - 2, h: GRID_ROWS - 2 })
  })
})

describe('pxToCells and rectStyle', () => {
  it('rounds pointer movement to cells', () => {
    expect(pxToCells(149, 100)).toBe(1)
    expect(pxToCells(-151, 100)).toBe(-2)
    expect(pxToCells(50, 0)).toBe(0)
  })

  it('positions in percent of the canvas', () => {
    expect(rectStyle({ x: 0, y: 6, w: 6, h: 6 })).toEqual({
      left: 'calc(0% + 1px)',
      top: 'calc(50% + 1px)',
      width: 'calc(50% - 2px)',
      height: 'calc(50% - 2px)',
    })
  })
})

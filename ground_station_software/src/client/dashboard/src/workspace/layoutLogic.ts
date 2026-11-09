// Grid geometry for the module canvas. Pure, no React, no DOM.
//
// The canvas is a fixed grid of GRID_COLS x GRID_ROWS cells scaled to the
// viewport. Because the row count is fixed (not content-driven), modules can
// never extend past the screen, so the page never scrolls.

export const GRID_COLS = 12
export const GRID_ROWS = 12

export const MIN_W = 2
export const MIN_H = 2

// Size of a newly added module.
export const DEFAULT_W = 4
export const DEFAULT_H = 4

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Placed {
  id: string
  rect: Rect
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Snap to whole cells and keep the rect inside the grid at no less than the minimum size. */
export function clampRect(r: Rect): Rect {
  const w = clamp(Math.round(r.w), MIN_W, GRID_COLS)
  const h = clamp(Math.round(r.h), MIN_H, GRID_ROWS)
  return {
    x: clamp(Math.round(r.x), 0, GRID_COLS - w),
    y: clamp(Math.round(r.y), 0, GRID_ROWS - h),
    w,
    h,
  }
}

export function inBounds(r: Rect): boolean {
  return (
    Number.isInteger(r.x) &&
    Number.isInteger(r.y) &&
    Number.isInteger(r.w) &&
    Number.isInteger(r.h) &&
    r.w >= MIN_W &&
    r.h >= MIN_H &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.x + r.w <= GRID_COLS &&
    r.y + r.h <= GRID_ROWS
  )
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Ids of placed items that r would overlap, ignoring ignoreId (the item being moved). */
export function collisions(items: readonly Placed[], r: Rect, ignoreId?: string): string[] {
  return items.filter((it) => it.id !== ignoreId && overlaps(it.rect, r)).map((it) => it.id)
}

export function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

/** First free w x h spot scanning rows top to bottom, left to right; null if none. */
export function findFreeSpot(items: readonly Placed[], w: number, h: number): Rect | null {
  for (let y = 0; y + h <= GRID_ROWS; y++) {
    for (let x = 0; x + w <= GRID_COLS; x++) {
      const r = { x, y, w, h }
      if (collisions(items, r).length === 0) return r
    }
  }
  return null
}

export type DragMode = 'move' | 'resize'

/**
 * Candidate rect for a drag of dCols x dRows cells. Move keeps the size;
 * resize keeps the top-left corner and grows or shrinks toward the grid edge.
 */
export function dragRect(orig: Rect, mode: DragMode, dCols: number, dRows: number): Rect {
  if (mode === 'move') {
    return clampRect({ ...orig, x: orig.x + dCols, y: orig.y + dRows })
  }
  return {
    x: orig.x,
    y: orig.y,
    w: clamp(orig.w + dCols, MIN_W, GRID_COLS - orig.x),
    h: clamp(orig.h + dRows, MIN_H, GRID_ROWS - orig.y),
  }
}

/** CSS position for a grid rect, in percent of the canvas, with a 1px gutter on every side. */
export function rectStyle(r: Rect): { left: string; top: string; width: string; height: string } {
  const pct = (n: number, of: number) => `${(n / of) * 100}%`
  return {
    left: `calc(${pct(r.x, GRID_COLS)} + 1px)`,
    top: `calc(${pct(r.y, GRID_ROWS)} + 1px)`,
    width: `calc(${pct(r.w, GRID_COLS)} - 2px)`,
    height: `calc(${pct(r.h, GRID_ROWS)} - 2px)`,
  }
}

/** Pointer movement in pixels to whole cells. */
export function pxToCells(deltaPx: number, cellPx: number): number {
  if (cellPx <= 0) return 0
  return Math.round(deltaPx / cellPx)
}

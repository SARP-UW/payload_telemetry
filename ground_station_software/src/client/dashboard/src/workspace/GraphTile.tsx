import { memo, type KeyboardEvent, type PointerEvent } from 'react'
import LiveChart from '../components/LiveChart'
import { SLOTS, type Slot, type TelemetryMessage } from '../contract'
import type { ReadResult } from '../hooks/streamLogic'
import { SLOT_SHORT } from '../lanes'
import { rectStyle, type DragMode } from './layoutLogic'
import type { GraphModule } from './modules'

const WINDOW_CHOICES = [10, 30, 60, 120, 300]

interface GraphTileProps {
  mod: GraphModule
  stale: boolean
  dragging: boolean
  fieldsBySlot: Record<Slot, readonly string[]>
  getMessagesSince: (cursor: number) => ReadResult<TelemetryMessage>
  onDragStart: (e: PointerEvent<HTMLElement>, id: string, mode: DragMode) => void
  onDragMove: (e: PointerEvent<HTMLElement>) => void
  onDragEnd: (e: PointerEvent<HTMLElement>) => void
  onKey: (e: KeyboardEvent<HTMLElement>, id: string) => void
  onRemove: (id: string) => void
  onSource: (id: string, slot: Slot, field: string | null) => void
  onWindow: (id: string, seconds: number) => void
}

function GraphTile({
  mod,
  stale,
  dragging,
  fieldsBySlot,
  getMessagesSince,
  onDragStart,
  onDragMove,
  onDragEnd,
  onKey,
  onRemove,
  onSource,
  onWindow,
}: GraphTileProps) {
  const fields = fieldsBySlot[mod.slot]
  const fieldChoices = mod.field !== null && !fields.includes(mod.field) ? [mod.field, ...fields] : fields
  const windowChoices = WINDOW_CHOICES.includes(mod.windowS) ? WINDOW_CHOICES : [mod.windowS, ...WINDOW_CHOICES]
  const dragHandlers = { onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragEnd }

  return (
    <section
      className={`module${dragging ? ' dragging' : ''}`}
      style={rectStyle(mod.rect)}
      tabIndex={0}
      aria-label={`${mod.id}: graph of ${SLOT_SHORT[mod.slot]} ${mod.field ?? 'auto'}. Arrow keys move, Shift+arrows resize, Delete removes.`}
      onKeyDown={(e) => onKey(e, mod.id)}
    >
      <header
        className="mod-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('select, button')) return
          onDragStart(e, mod.id, 'move')
        }}
        {...dragHandlers}
      >
        <span className="mod-id">{mod.id}</span>
        <select
          aria-label={`${mod.id} slot`}
          value={mod.slot}
          onChange={(e) => onSource(mod.id, e.target.value as Slot, null)}
        >
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_SHORT[s]}
            </option>
          ))}
        </select>
        <select
          aria-label={`${mod.id} field`}
          value={mod.field ?? ''}
          onChange={(e) => onSource(mod.id, mod.slot, e.target.value === '' ? null : e.target.value)}
        >
          <option value="">auto</option>
          {fieldChoices.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          aria-label={`${mod.id} time window`}
          value={mod.windowS}
          onChange={(e) => onWindow(mod.id, Number(e.target.value))}
        >
          {windowChoices.map((s) => (
            <option key={s} value={s}>
              {s}s
            </option>
          ))}
        </select>
        {stale && <span className="mod-stale">STALE</span>}
        <button type="button" className="mod-close" aria-label={`Remove ${mod.id}`} onClick={() => onRemove(mod.id)}>
          ×
        </button>
      </header>

      <div className="mod-body">
        <LiveChart
          slot={mod.slot}
          field={mod.field}
          windowSeconds={mod.windowS}
          getMessagesSince={getMessagesSince}
          compact
        />
      </div>

      <div
        className="mod-resize"
        aria-hidden="true"
        onPointerDown={(e) => onDragStart(e, mod.id, 'resize')}
        {...dragHandlers}
      />
    </section>
  )
}

export default memo(GraphTile)

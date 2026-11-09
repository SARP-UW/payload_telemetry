import type { SlotConfig, UserSlot, UserTelemetry } from '../contract'
import { formatValue, humanize } from '../format'
import { lossTone, SLOT_STATE_INFO, slotState } from '../health'
import type { ConnectionStatus } from '../hooks/useWebSocket'
import { SLOT_LABELS } from '../lanes'
import Chip from './Chip'

interface UserPanelProps {
  slot: UserSlot
  status: ConnectionStatus
  latest: UserTelemetry | null
  config: SlotConfig | undefined
  rate: number
  missingPct: number
}

/**
 * Generic panel for a user peripheral. Its packet structure isn't defined yet,
 * so it shows whatever fields arrive plus the slot's display config.
 */
function UserPanel({ slot, status, latest, config, rate, missingPct }: UserPanelProps) {
  const state = SLOT_STATE_INFO[slotState(status, rate)]
  const fields = latest ? Object.entries(latest.data) : []
  const configEntries = config ? Object.entries(config) : []
  const titleId = `${slot}-title`

  return (
    <section className={`card${status === 'open' ? '' : ' is-stale'}`} aria-labelledby={titleId}>
      <div className="card-header">
        <div>
          <h2 id={titleId}>{SLOT_LABELS[slot]}</h2>
          <p className="note">Packet structure TBD. Showing whatever fields arrive.</p>
        </div>
        <Chip tone={state.tone}>{state.label}</Chip>
      </div>

      {fields.length > 0 ? (
        <dl className="stats">
          {fields.map(([name, value]) => (
            <div className="stat" key={name}>
              <dt>{humanize(name)}</dt>
              <dd>{formatValue(value, 3)}</dd>
            </div>
          ))}
          <div className="stat">
            <dt>Rate</dt>
            <dd>{formatValue(rate, 1)}/s</dd>
          </div>
          <div className="stat">
            <dt>Missing</dt>
            <dd>
              <Chip tone={lossTone(missingPct)}>{formatValue(missingPct, 1)}%</Chip>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="empty">Waiting for data…</p>
      )}

      <h3>Display config</h3>
      {configEntries.length > 0 ? (
        <dl className="kv">
          {configEntries.map(([key, value]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{humanize(key)}</dt>
              <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="empty">No config received.</p>
      )}
    </section>
  )
}

export default UserPanel

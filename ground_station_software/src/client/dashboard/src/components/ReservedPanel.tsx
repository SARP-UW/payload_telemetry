import type { ReservedTelemetry, TelemetryMessage } from '../contract'
import { formatValue, humanize } from '../format'
import { SLOT_STATE_INFO, slotState } from '../health'
import type { ReadResult } from '../hooks/streamLogic'
import type { ConnectionStatus } from '../hooks/useWebSocket'
import { RESERVED_CHART_FIELDS, RESERVED_READOUT_FIELDS, SLOT_LABELS } from '../lanes'
import Chip from './Chip'
import LiveChart from './LiveChart'

interface ReservedPanelProps {
  status: ConnectionStatus
  latest: ReservedTelemetry | null
  rate: number
  getMessagesSince: (cursor: number) => ReadResult<TelemetryMessage>
}

function ReservedPanel({ status, latest, rate, getMessagesSince }: ReservedPanelProps) {
  const state = SLOT_STATE_INFO[slotState(status, rate)]

  return (
    <section className={`card${status === 'open' ? '' : ' is-stale'}`} aria-labelledby="reserved-title">
      <div className="card-header">
        <div>
          <h2 id="reserved-title">{SLOT_LABELS.reserved}</h2>
          <p className="note">GPS, rocket status and link health</p>
        </div>
        <Chip tone={state.tone}>{state.label}</Chip>
      </div>

      <dl className="stats">
        {RESERVED_READOUT_FIELDS.map((field) => (
          <div className="stat" key={field}>
            <dt>{humanize(field)}</dt>
            <dd>{formatValue(latest?.data[field], 6)}</dd>
          </div>
        ))}
        <div className="stat">
          <dt>Rate</dt>
          <dd>{formatValue(rate, 1)}/s</dd>
        </div>
      </dl>

      <div className="charts">
        {RESERVED_CHART_FIELDS.map((field) => (
          <LiveChart key={field} slot="reserved" field={field} height={240} getMessagesSince={getMessagesSince} />
        ))}
      </div>
    </section>
  )
}

export default ReservedPanel

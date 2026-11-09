import { SLOTS, type Slot } from '../contract'
import { formatValue } from '../format'
import { lossTone, SLOT_STATE_INFO, slotState } from '../health'
import { lossPercent } from '../hooks/streamLogic'
import type { ConnectionStatus } from '../hooks/useWebSocket'
import { SLOT_LABELS } from '../lanes'
import Chip from './Chip'

interface LinkHealthPanelProps {
  status: ConnectionStatus
  rateBySlot: Record<Slot, number>
  receivedBySlot: Record<Slot, number>
  srcGapsBySlot: Record<Slot, number>
  gaps: number
}

function LinkHealthPanel({ status, rateBySlot, receivedBySlot, srcGapsBySlot, gaps }: LinkHealthPanelProps) {
  return (
    <section className={`card${status === 'open' ? '' : ' is-stale'}`} aria-labelledby="health-title">
      <div className="card-header">
        <h2 id="health-title">Link health</h2>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Slot</th>
              <th>State</th>
              <th className="num">Rate</th>
              <th className="num">Missing</th>
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => {
              const state = SLOT_STATE_INFO[slotState(status, rateBySlot[slot])]
              const missing = lossPercent(receivedBySlot[slot], srcGapsBySlot[slot])
              return (
                <tr key={slot}>
                  <td>{SLOT_LABELS[slot]}</td>
                  <td>
                    <Chip tone={state.tone}>{state.label}</Chip>
                  </td>
                  <td className="num">{formatValue(rateBySlot[slot], 1)}/s</td>
                  <td className="num">
                    <Chip tone={lossTone(missing)} title={`${srcGapsBySlot[slot]} packets missing`}>
                      {formatValue(missing, 1)}%
                    </Chip>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="note">
        Missing counts packets that never reached the ground station server. It can include data the board drops
        on purpose, so it isn't purely radio loss.
      </p>
      <p className="note">
        Server → browser drops: <strong>{gaps}</strong>
      </p>
    </section>
  )
}

export default LinkHealthPanel

import Chip from './components/Chip'
import CommandPanel from './components/CommandPanel'
import LinkHealthPanel from './components/LinkHealthPanel'
import ReservedPanel from './components/ReservedPanel'
import UserPanel from './components/UserPanel'
import { PACKET_FIELDS, SLOTS } from './contract'
import { humanize } from './format'
import { connectionInfo } from './health'
import { lossPercent } from './hooks/streamLogic'
import { useWebSocket } from './hooks/useWebSocket'
import { SLOT_LABELS, USER_SLOTS } from './lanes'

function App() {
  const {
    status,
    latestBySlot,
    receivedBySlot,
    rateBySlot,
    srcGapsBySlot,
    config,
    commands,
    received,
    invalid,
    gaps,
    getMessagesSince,
    sendCommand,
  } = useWebSocket()
  const connection = connectionInfo(status)
  const reserved = latestBySlot.reserved

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Ground Station</h1>
          <p className="subtitle">Payload telemetry dashboard</p>
        </div>
        <div className="topbar-status">
          <span>
            {received.toLocaleString()} messages · {invalid} invalid
          </span>
          <span role="status">
            <Chip tone={connection.tone}>{connection.label}</Chip>
          </span>
        </div>
      </header>

      {status === 'reconnecting' && (
        <p className="banner" role="alert">
          Lost connection to the ground station server. Retrying automatically. Values shown are from before the drop.
        </p>
      )}

      <main className="stack">
        <div className="grid-main">
          <ReservedPanel
            status={status}
            latest={reserved}
            rate={rateBySlot.reserved}
            getMessagesSince={getMessagesSince}
          />
          <LinkHealthPanel
            status={status}
            rateBySlot={rateBySlot}
            receivedBySlot={receivedBySlot}
            srcGapsBySlot={srcGapsBySlot}
            gaps={gaps}
          />
        </div>

        <div className="grid-two">
          {USER_SLOTS.map((slot) => (
            <UserPanel
              key={slot}
              slot={slot}
              status={status}
              latest={latestBySlot[slot]}
              config={config?.[slot]}
              rate={rateBySlot[slot]}
              missingPct={lossPercent(receivedBySlot[slot], srcGapsBySlot[slot])}
            />
          ))}
        </div>

        <CommandPanel status={status} commands={commands} sendCommand={sendCommand} />

        <details className="card">
          <summary>Debug details</summary>

          <div className="table-wrap">
            <table>
              <caption>Per slot</caption>
              <thead>
                <tr>
                  <th>Slot</th>
                  <th className="num">Received</th>
                  <th className="num">Last seq</th>
                  <th className="num">Rate (msgs/s)</th>
                  <th className="num">Missing src_seq</th>
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot) => (
                  <tr key={slot}>
                    <td>{SLOT_LABELS[slot]}</td>
                    <td className="num">{receivedBySlot[slot]}</td>
                    <td className="num">{latestBySlot[slot]?.seq ?? '—'}</td>
                    <td className="num">{rateBySlot[slot].toFixed(1)}</td>
                    <td className="num">{srcGapsBySlot[slot]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table>
              <caption>Reserved fields (latest)</caption>
              <thead>
                <tr>
                  <th>Field</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {PACKET_FIELDS.map((field) => (
                  <tr key={field}>
                    <td>{humanize(field)}</td>
                    <td className="num">{reserved ? reserved.data[field] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Config from server</h3>
          <pre>{config ? JSON.stringify(config, null, 2) : 'No config received.'}</pre>
        </details>
      </main>
    </div>
  )
}

export default App

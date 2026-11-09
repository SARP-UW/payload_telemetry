import { useState, type FormEvent } from 'react'
import { SLOTS, type Slot } from '../contract'
import { clockTime } from '../format'
import { commandInfo } from '../health'
import { parseArgs, type CommandRecord } from '../hooks/commandLogic'
import type { ConnectionStatus } from '../hooks/useWebSocket'
import { SLOT_LABELS } from '../lanes'
import Chip from './Chip'

interface CommandPanelProps {
  status: ConnectionStatus
  commands: readonly CommandRecord[]
  sendCommand: (target: Slot, command: string, args: Record<string, unknown>) => number
}

/**
 * Send a command to the board and track its acknowledgement. Command names are
 * free text until the command set is defined [TBD with Christian].
 */
function CommandPanel({ status, commands, sendCommand }: CommandPanelProps) {
  const [target, setTarget] = useState<Slot>('user1')
  const [command, setCommand] = useState('')
  const [argsText, setArgsText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const connected = status === 'open'

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = command.trim()
    if (name === '') {
      setError('Enter a command name.')
      return
    }
    const args = parseArgs(argsText)
    if (!args.ok) {
      setError(args.error)
      return
    }
    setError(null)
    sendCommand(target, name, args.value)
  }

  return (
    <section className="card" aria-labelledby="commands-title">
      <div className="card-header">
        <div>
          <h2 id="commands-title">Commands</h2>
          <p className="note">The USB link to the board isn't built yet, so commands are checked but not sent.</p>
        </div>
      </div>

      <form className="command-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="cmd-target">Target</label>
          <select id="cmd-target" value={target} onChange={(e) => setTarget(e.target.value as Slot)}>
            {SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {SLOT_LABELS[slot]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="cmd-name">Command</label>
          <input
            id="cmd-name"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Command name"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label htmlFor="cmd-args">Arguments (optional JSON)</label>
          <textarea
            id="cmd-args"
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            placeholder='{"key": 1}'
            spellCheck={false}
          />
        </div>

        <button type="submit" disabled={!connected}>
          Send
        </button>
      </form>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : (
        !connected && <p className="form-message note">Sending is paused until the ground station is connected.</p>
      )}

      {commands.length > 0 ? (
        <div className="table-wrap">
          <table>
            <caption>Recent commands</caption>
            <thead>
              <tr>
                <th>Time</th>
                <th className="num">#</th>
                <th>Target</th>
                <th>Command</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {[...commands].reverse().map((rec) => {
                const info = commandInfo(rec.status)
                return (
                  <tr key={rec.cmdSeq}>
                    <td className="num">{clockTime(rec.sentAt)}</td>
                    <td className="num">{rec.cmdSeq}</td>
                    <td>{SLOT_LABELS[rec.target]}</td>
                    <td>{rec.command}</td>
                    <td>
                      <Chip tone={info.tone}>{info.label}</Chip>
                    </td>
                    <td className="note">{rec.reason}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No commands sent yet.</p>
      )}
    </section>
  )
}

export default CommandPanel

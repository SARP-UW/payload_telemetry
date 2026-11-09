import { clockTime } from '../format'
import { commandInfo } from '../health'
import type { CommandRecord } from '../hooks/commandLogic'
import { SLOT_SHORT } from '../lanes'
import type { ResultTone } from './CommandBar'
import { HELP } from './commandParser'

export interface LogEntry {
  id: number
  time: number // Date.now()
  text: string
  tone: ResultTone
}

// Fixed line counts so the overlay never needs to scroll.
const LOG_LINES = 12
const COMMAND_LINES = 6

interface InfoOverlayProps {
  mode: 'help' | 'log'
  log: readonly LogEntry[]
  commands: readonly CommandRecord[]
}

/** Help or log panel drawn over the bottom of the canvas; does not affect layout. */
function InfoOverlay({ mode, log, commands }: InfoOverlayProps) {
  if (mode === 'help') {
    return (
      <div className="overlay" role="dialog" aria-label="Command help">
        <table>
          <tbody>
            {HELP.map(([syntax, text]) => (
              <tr key={syntax}>
                <td className="syntax">{syntax}</td>
                <td>{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="overlay-note">
          Keys: / focus bar · ↑↓ history · Esc close · on a focused module: arrows move, Shift+arrows resize, Delete
          removes. Drag a module by its header; resize from the bottom-right corner.
        </p>
      </div>
    )
  }

  const lines = log.slice(-LOG_LINES)
  const recent = commands.slice(-COMMAND_LINES).reverse()
  return (
    <div className="overlay" role="dialog" aria-label="Output log">
      <table>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td className="t-info">No output.</td>
            </tr>
          )}
          {lines.map((entry) => (
            <tr key={entry.id}>
              <td className="time">{new Date(entry.time).toLocaleTimeString([], { hour12: false })}</td>
              <td className={`t-${entry.tone}`}>{entry.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table>
        <caption>Board commands</caption>
        <tbody>
          {recent.length === 0 && (
            <tr>
              <td className="t-info">None sent.</td>
            </tr>
          )}
          {recent.map((rec) => {
            const info = commandInfo(rec.status)
            return (
              <tr key={rec.cmdSeq}>
                <td className="time">{clockTime(rec.sentAt)}</td>
                <td>
                  #{rec.cmdSeq} {SLOT_SHORT[rec.target]} {rec.command}
                </td>
                <td className={`t-${info.tone}`}>{info.label}</td>
                <td className="t-info">{rec.reason}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default InfoOverlay

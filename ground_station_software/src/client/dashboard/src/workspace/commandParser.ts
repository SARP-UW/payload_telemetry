// Parser for the command bar. Pure, no React. Turns one typed line into a
// typed command or an error message the bar can show.

import type { Slot } from '../contract'

export type ParsedCommand =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'help' }
  | { kind: 'list' }
  | { kind: 'reset' }
  | { kind: 'clear' }
  | { kind: 'log' }
  | { kind: 'fields'; slot: Slot }
  | { kind: 'add'; slot: Slot; field: string | null }
  | { kind: 'remove'; id: string }
  | { kind: 'source'; id: string; slot: Slot; field: string | null }
  | { kind: 'window'; id: string; seconds: number }
  | { kind: 'move'; id: string; x: number; y: number }
  | { kind: 'size'; id: string; w: number; h: number }
  | { kind: 'send'; target: Slot; command: string; argsText: string }

export const HELP: readonly [string, string][] = [
  ['add graph <slot> [field]', 'Add a graph. Slot: reserved|user1|user2 (r, u1, u2). Field omitted = auto'],
  ['rm <id>', 'Remove a module (e.g. rm g3)'],
  ['source <id> <slot> [field]', 'Change what a graph shows'],
  ['window <id> <seconds>', 'Set a graph time window'],
  ['move <id> <x> <y>', 'Place a module at grid cell x,y (0-11)'],
  ['size <id> <w> <h>', 'Resize a module in grid cells'],
  ['list', 'List modules'],
  ['fields <slot>', 'List fields available for a slot'],
  ['send <target> <command> [json]', 'Send a command to the board, e.g. send u1 [cmd] {"a":1}'],
  ['log', 'Show or hide the output and command log'],
  ['reset', 'Restore the default layout'],
  ['clear', 'Clear the output log'],
  ['help', 'Show or hide this help'],
]

const SLOT_ALIASES: Record<string, Slot> = {
  reserved: 'reserved',
  rsv: 'reserved',
  r: 'reserved',
  user1: 'user1',
  u1: 'user1',
  user2: 'user2',
  u2: 'user2',
}

const err = (message: string): ParsedCommand => ({ kind: 'error', message })

function slotOf(token: string | undefined): Slot | null {
  return token ? (SLOT_ALIASES[token.toLowerCase()] ?? null) : null
}

function fieldOf(token: string | undefined): string | null {
  if (token === undefined || token.toLowerCase() === 'auto') return null
  return token
}

function idOf(token: string | undefined): string | null {
  return token && /^g\d+$/i.test(token) ? token.toLowerCase() : null
}

function intOf(token: string | undefined): number | null {
  if (token === undefined || !/^-?\d+$/.test(token)) return null
  return Number(token)
}

const BAD_SLOT = 'Slot must be reserved, user1 or user2 (r, u1, u2)'
const BAD_ID = 'Module id looks like g1. Try: list'

export function parseCommand(line: string): ParsedCommand {
  const text = line.trim()
  if (text === '') return { kind: 'empty' }

  // send keeps the rest of the line verbatim as JSON args.
  const send = /^send\s+(\S+)\s+(\S+)\s*(.*)$/i.exec(text)
  if (send) {
    const target = slotOf(send[1])
    if (!target) return err(BAD_SLOT)
    return { kind: 'send', target, command: send[2], argsText: send[3] }
  }

  const [verb, ...args] = text.split(/\s+/)
  switch (verb.toLowerCase()) {
    case 'help':
    case '?':
      return { kind: 'help' }
    case 'list':
    case 'ls':
      return { kind: 'list' }
    case 'reset':
      return { kind: 'reset' }
    case 'clear':
      return { kind: 'clear' }
    case 'log':
      return { kind: 'log' }
    case 'send':
      return err('Usage: send <target> <command> [json]')

    case 'fields': {
      const slot = slotOf(args[0])
      return slot ? { kind: 'fields', slot } : err(BAD_SLOT)
    }

    case 'add': {
      // "add graph <slot> [field]" or the short form "add <slot> [field]"
      const rest = args[0]?.toLowerCase() === 'graph' ? args.slice(1) : args
      const slot = slotOf(rest[0])
      if (!slot) return err(`Usage: add graph <slot> [field]. ${BAD_SLOT}`)
      return { kind: 'add', slot, field: fieldOf(rest[1]) }
    }

    case 'rm':
    case 'remove':
    case 'del': {
      const id = idOf(args[0])
      return id ? { kind: 'remove', id } : err(BAD_ID)
    }

    case 'source':
    case 'src': {
      const id = idOf(args[0])
      if (!id) return err(BAD_ID)
      const slot = slotOf(args[1])
      if (!slot) return err(`Usage: source <id> <slot> [field]. ${BAD_SLOT}`)
      return { kind: 'source', id, slot, field: fieldOf(args[2]) }
    }

    case 'window':
    case 'win': {
      const id = idOf(args[0])
      if (!id) return err(BAD_ID)
      const seconds = intOf(args[1])
      return seconds === null ? err('Usage: window <id> <seconds>') : { kind: 'window', id, seconds }
    }

    case 'move':
    case 'mv': {
      const id = idOf(args[0])
      if (!id) return err(BAD_ID)
      const x = intOf(args[1])
      const y = intOf(args[2])
      return x === null || y === null ? err('Usage: move <id> <x> <y>') : { kind: 'move', id, x, y }
    }

    case 'size': {
      const id = idOf(args[0])
      if (!id) return err(BAD_ID)
      const w = intOf(args[1])
      const h = intOf(args[2])
      return w === null || h === null ? err('Usage: size <id> <w> <h>') : { kind: 'size', id, w, h }
    }

    default:
      return err(`Unknown command '${verb}'. Type help`)
  }
}

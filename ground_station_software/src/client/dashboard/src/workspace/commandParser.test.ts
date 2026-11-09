import { describe, expect, it } from 'vitest'
import { parseCommand } from './commandParser'

describe('parseCommand', () => {
  it('handles empty input and simple verbs', () => {
    expect(parseCommand('   ')).toEqual({ kind: 'empty' })
    expect(parseCommand('help')).toEqual({ kind: 'help' })
    expect(parseCommand('?')).toEqual({ kind: 'help' })
    expect(parseCommand('LS')).toEqual({ kind: 'list' })
    expect(parseCommand('reset')).toEqual({ kind: 'reset' })
    expect(parseCommand('log')).toEqual({ kind: 'log' })
  })

  it('parses add in long and short form, with slot aliases and auto', () => {
    expect(parseCommand('add graph reserved altitude')).toEqual({ kind: 'add', slot: 'reserved', field: 'altitude' })
    expect(parseCommand('add u1')).toEqual({ kind: 'add', slot: 'user1', field: null })
    expect(parseCommand('add graph r auto')).toEqual({ kind: 'add', slot: 'reserved', field: null })
    expect(parseCommand('add graph moon').kind).toBe('error')
  })

  it('parses module commands with ids', () => {
    expect(parseCommand('rm G3')).toEqual({ kind: 'remove', id: 'g3' })
    expect(parseCommand('source g2 u2 [field_1]')).toEqual({
      kind: 'source',
      id: 'g2',
      slot: 'user2',
      field: '[field_1]',
    })
    expect(parseCommand('window g1 60')).toEqual({ kind: 'window', id: 'g1', seconds: 60 })
    expect(parseCommand('move g1 3 4')).toEqual({ kind: 'move', id: 'g1', x: 3, y: 4 })
    expect(parseCommand('size g1 6 2')).toEqual({ kind: 'size', id: 'g1', w: 6, h: 2 })
  })

  it('reports bad ids and numbers', () => {
    expect(parseCommand('rm 3').kind).toBe('error')
    expect(parseCommand('window g1 soon').kind).toBe('error')
    expect(parseCommand('move g1 3').kind).toBe('error')
  })

  it('keeps send arguments verbatim', () => {
    expect(parseCommand('send u1 [cmd] {"mode": 2, "x": "a b"}')).toEqual({
      kind: 'send',
      target: 'user1',
      command: '[cmd]',
      argsText: '{"mode": 2, "x": "a b"}',
    })
    expect(parseCommand('send rsv ping')).toEqual({ kind: 'send', target: 'reserved', command: 'ping', argsText: '' })
    expect(parseCommand('send u1').kind).toBe('error')
    expect(parseCommand('send mars ping').kind).toBe('error')
  })

  it('rejects unknown commands with a hint', () => {
    const r = parseCommand('launch')
    expect(r).toEqual({ kind: 'error', message: "Unknown command 'launch'. Type help" })
  })
})

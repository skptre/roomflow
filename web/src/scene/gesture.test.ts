import { describe, expect, it } from 'vitest'
import { gestureOutcome } from './gesture'

describe('gestureOutcome', () => {
  it('commits a move only onto a valid spot', () => {
    expect(gestureOutcome({ kind: 'move', status: 'ok', cancelled: false })).toBe('commit')
    expect(gestureOutcome({ kind: 'move', status: 'overlap', cancelled: false })).toBe('snap-back')
    expect(gestureOutcome({ kind: 'move', status: 'outside', cancelled: false })).toBe('snap-back')
  })

  it('snaps back a rotation that would overlap; lets the command nudge one that pokes outside', () => {
    expect(gestureOutcome({ kind: 'rotate', status: 'ok', cancelled: false })).toBe('commit')
    expect(gestureOutcome({ kind: 'rotate', status: 'outside', cancelled: false })).toBe('commit')
    expect(gestureOutcome({ kind: 'rotate', status: 'overlap', cancelled: false })).toBe('snap-back')
  })

  it('never commits a cancelled gesture', () => {
    expect(gestureOutcome({ kind: 'move', status: 'ok', cancelled: true })).toBe('snap-back')
    expect(gestureOutcome({ kind: 'rotate', status: 'ok', cancelled: true })).toBe('snap-back')
  })
})

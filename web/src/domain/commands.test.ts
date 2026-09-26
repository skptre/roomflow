import { describe, expect, it } from 'vitest'
import { lamp, sampleRoom } from '../test/rooms'
import { applyCommands, type Command } from './commands'
import type { Room } from './schema'

function run(room: Room, commands: Command[], actor: 'user' | 'auto' = 'user') {
  return applyCommands(room, commands, actor)
}

const find = (room: Room, id: string) => room.objects.find((o) => o.id === id)

describe('applyCommands', () => {
  it('adds an object inside the room without mutating the input', () => {
    const room = sampleRoom()
    const before = structuredClone(room)
    const result = run(room, [{ type: 'add', object: lamp() }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(find(result.room, 'lamp-1')).toBeDefined()
    expect(room).toEqual(before)
  })

  it('rejects adding a duplicate id', () => {
    const room = sampleRoom()
    const result = run(room, [{ type: 'add', object: { ...lamp(), id: 'OBJ-BED' } }])
    expect(result.ok).toBe(false)
  })

  it('moves an object and keeps its yaw and size', () => {
    const room = sampleRoom()
    const result = run(room, [{ type: 'move', id: 'OBJ-CHAIR', position: { x: 0.5, z: -1 } }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const chair = find(result.room, 'OBJ-CHAIR')!
    const original = find(room, 'OBJ-CHAIR')!
    expect(chair.pose.position).toEqual({ x: 0.5, y: original.pose.position.y, z: -1 })
    expect(chair.pose.yaw).toBe(original.pose.yaw)
    expect(chair.dimensions).toEqual(original.dimensions)
  })

  it('rejects a move that leaves the room', () => {
    const room = sampleRoom()
    const result = run(room, [{ type: 'move', id: 'OBJ-CHAIR', position: { x: 5, z: 0 } }])
    expect(result.ok).toBe(false)
  })

  it('warns when a move overlaps another object but allows it', () => {
    const room = sampleRoom()
    const bed = find(room, 'OBJ-BED')!
    const result = run(room, [{ type: 'move', id: 'OBJ-CHAIR', position: { x: bed.pose.position.x, z: bed.pose.position.z } }])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.warnings.join(' ')).toMatch(/overlap/i)
  })

  it('rotates without resizing and nudges back inside when the new footprint pokes out', () => {
    const room = sampleRoom()
    const desk = find(room, 'OBJ-DESK')!
    const result = run(room, [{ type: 'rotate', id: 'OBJ-DESK', yaw: 0 }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const rotated = find(result.room, 'OBJ-DESK')!
    expect(rotated.pose.yaw).toBe(0)
    expect(rotated.dimensions).toEqual(desk.dimensions)
    // 1.2 m wide along X now; it had been flush against the east wall at x = 2.
    expect(rotated.pose.position.x + 0.6).toBeLessThanOrEqual(2 + 1e-6)
  })

  it('does not let automated changes move, rotate, or replace-away protected items', () => {
    const room = run(sampleRoom(), [
      { type: 'setLock', id: 'OBJ-BED', lock: true },
      { type: 'setKeep', id: 'OBJ-DESK', keep: true },
    ])
    expect(room.ok).toBe(true)
    if (!room.ok) return
    expect(run(room.room, [{ type: 'move', id: 'OBJ-BED', position: { x: 0, z: 0 } }], 'auto').ok).toBe(false)
    expect(run(room.room, [{ type: 'rotate', id: 'OBJ-BED', yaw: 1 }], 'auto').ok).toBe(false)
    expect(run(room.room, [{ type: 'remove', id: 'OBJ-DESK' }], 'auto').ok).toBe(false)
    // The user may still do all of these directly.
    expect(run(room.room, [{ type: 'remove', id: 'OBJ-DESK' }], 'user').ok).toBe(true)
  })

  it('replaces an object in place, keeping its id and pose', () => {
    const room = sampleRoom()
    const original = find(room, 'OBJ-CHAIR')!
    const replacement = { ...lamp(), name: 'Lounge chair', category: 'lounge-chair' }
    const result = run(room, [{ type: 'replace', id: 'OBJ-CHAIR', with: replacement }])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const chair = find(result.room, 'OBJ-CHAIR')!
    expect(chair.id).toBe('OBJ-CHAIR')
    expect(chair.name).toBe('Lounge chair')
    expect(chair.pose.yaw).toBe(original.pose.yaw)
    expect(chair.offerId).toBe('o-lamp')
  })

  it('keeps the placement lock when an item is replaced', () => {
    const locked = run(sampleRoom(), [{ type: 'setLock', id: 'OBJ-CHAIR', lock: true }])
    expect(locked.ok).toBe(true)
    if (!locked.ok) return
    const result = run(locked.room, [{ type: 'replace', id: 'OBJ-CHAIR', with: lamp() }])
    expect(result.ok && find(result.room, 'OBJ-CHAIR')!.lockPlacement).toBe(true)
  })

  it('rejects non-boolean keep and lock values', () => {
    const room = sampleRoom()
    const badKeep = { type: 'setKeep', id: 'OBJ-BED', keep: 'yes' } as unknown as Command
    const badLock = { type: 'setLock', id: 'OBJ-BED', lock: 1 } as unknown as Command
    expect(run(room, [badKeep]).ok).toBe(false)
    expect(run(room, [badLock]).ok).toBe(false)
  })

  it('does not let automated changes turn off keep or lock, even within one batch', () => {
    const room = sampleRoom()
    const unkeepThenRemove = run(room, [{ type: 'setKeep', id: 'OBJ-BED', keep: false }, { type: 'remove', id: 'OBJ-BED' }], 'auto')
    expect(unkeepThenRemove.ok).toBe(false)
    const locked = run(room, [{ type: 'setLock', id: 'OBJ-BED', lock: true }])
    expect(locked.ok).toBe(true)
    if (!locked.ok) return
    const unlockThenMove = run(
      locked.room,
      [{ type: 'setLock', id: 'OBJ-BED', lock: false }, { type: 'move', id: 'OBJ-BED', position: { x: -0.6, z: 0.6 } }],
      'auto',
    )
    expect(unlockThenMove.ok).toBe(false)
  })

  it('rejects unknown commands and malformed payloads readably, without throwing', () => {
    const room = sampleRoom()
    const bogus = { type: 'bogus' } as unknown as Command
    const noPosition = { type: 'move', id: 'OBJ-CHAIR' } as unknown as Command
    const stringPosition = { type: 'move', id: 'OBJ-CHAIR', position: { x: '1', z: 0 } } as unknown as Command
    for (const command of [bogus, noPosition, stringPosition]) {
      const result = run(room, [command])
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/\S/)
    }
  })

  it('applies a batch atomically: one bad command rejects all', () => {
    const room = sampleRoom()
    const result = run(room, [
      { type: 'remove', id: 'OBJ-CHAIR' },
      { type: 'remove', id: 'does-not-exist' },
    ])
    expect(result.ok).toBe(false)
  })

  it('restyles finishes with validated colors', () => {
    const room = sampleRoom()
    const ok = run(room, [{ type: 'restyle', finishes: { wall: '#ffffff', floor: '#000000' } }])
    expect(ok.ok && ok.room.finishes.wall).toBe('#ffffff')
    expect(run(room, [{ type: 'restyle', finishes: { wall: 'red', floor: '#000000' } }]).ok).toBe(false)
  })
})

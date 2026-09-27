import { beforeEach, describe, expect, it } from 'vitest'
import { designStore } from '../domain/designStore'
import { lamp, sampleRoom } from '../test/rooms'
import { nudgeOnWall, rotateObject, rotateSelected } from './editorActions'
import { wallSpot } from '../domain/layout'
import { noticeStore } from './noticeStore'

beforeEach(() => {
  designStore.getState().loadRoom(sampleRoom())
  noticeStore.getState().dismiss()
})

describe('rotateObject', () => {
  it('says so when the room nudged the item to keep it inside', () => {
    // The desk sits flush against the east wall; turned 90° its long side pokes through it.
    expect(rotateObject('OBJ-DESK', 0)).toBe(true)
    expect(noticeStore.getState().notice?.text).toMatch(/nudged/i)
  })

  it('stays quiet when the rotation fits where it is', () => {
    expect(rotateObject('OBJ-CHAIR', 0)).toBe(true)
    expect(noticeStore.getState().notice).toBeNull()
  })
})

describe('rotateObject for a ring gesture (rejectOverlap)', () => {
  // Codex repro: a 4 × 4 m room; A (2 × 1 m) at (0.5, 2) turned 90°, B (0.2 × 0.2 m) at (1.7, 2).
  function squareRoom() {
    const base = sampleRoom()
    const a = { ...lamp('A', 0.5, 2), name: 'A', dimensions: { width: 2, height: 0.8, depth: 1, source: 'merchant' as const } }
    a.pose = { ...a.pose, yaw: Math.PI / 2 }
    const b = { ...lamp('B', 1.7, 2), name: 'B', dimensions: { width: 0.2, height: 0.8, depth: 0.2, source: 'merchant' as const } }
    return {
      ...base,
      floorPolygon: [
        { x: 0, z: 0 },
        { x: 4, z: 0 },
        { x: 4, z: 4 },
        { x: 0, z: 4 },
      ],
      objects: [a, b],
    }
  }

  it('snaps back when the nudged-inside pose would overlap something', () => {
    designStore.getState().loadRoom(squareRoom())
    const before = designStore.getState().committed!.room
    expect(rotateObject('A', 0, { rejectOverlap: true })).toBe(false)
    expect(designStore.getState().committed!.room).toBe(before)
    expect(noticeStore.getState().notice?.text).toMatch(/overlap/i)
  })

  it('still commits and reports a nudge when the final pose is clear', () => {
    const room = squareRoom()
    designStore.getState().loadRoom({ ...room, objects: room.objects.filter((o) => o.id === 'A') })
    expect(rotateObject('A', 0, { rejectOverlap: true })).toBe(true)
    expect(noticeStore.getState().notice?.text).toMatch(/nudged/i)
  })
})

describe('rotateSelected', () => {
  it('refuses to turn a picture hung on the wall', () => {
    const room = sampleRoom()
    const art = { ...lamp('art', 0, -1.7), name: 'Print', category: 'wall-art', dimensions: { width: 0.6, height: 0.8, depth: 0.04, source: 'merchant' as const } }
    art.pose = { ...art.pose, position: { ...art.pose.position, y: 1.2 } }
    designStore.getState().loadRoom({ ...room, objects: [...room.objects, art] })
    designStore.getState().select('art')
    expect(rotateSelected(1)).toBe(false)
    expect(noticeStore.getState().notice?.text).toMatch(/wall/i)
  })
})

describe('nudgeOnWall', () => {
  function hangArt() {
    const room = sampleRoom()
    const candidate = { ...lamp('art'), name: 'Art', category: 'wall-art', dimensions: { width: 0.6, height: 0.8, depth: 0.04, source: 'merchant' as const } }
    const placed = wallSpot(room, candidate, 1.2)!
    designStore.getState().loadRoom({ ...room, objects: [...room.objects, placed] })
    return placed
  }
  const art = () => designStore.getState().committed!.room.objects.find((object) => object.id === 'art')!

  it('moves a painting to the right as seen facing it, and up, staying on its wall', () => {
    const before = hangArt()
    // Facing the painting, your right is its local +X: (cos yaw, −sin yaw).
    const right = { x: Math.cos(before.pose.yaw), z: -Math.sin(before.pose.yaw) }
    expect(nudgeOnWall('art', 0.1, 0.1)).toBe(true)
    const after = art()
    const moved = (after.pose.position.x - before.pose.position.x) * right.x + (after.pose.position.z - before.pose.position.z) * right.z
    expect(moved).toBeCloseTo(0.1, 6)
    expect(after.pose.position.y).toBeCloseTo(before.pose.position.y + 0.1, 6)
    expect(after.pose.yaw).toBeCloseTo(before.pose.yaw, 6)
  })

  it('undoes as one step', () => {
    const before = hangArt()
    nudgeOnWall('art', 0.1, 0)
    designStore.getState().undo()
    expect(art().pose).toEqual(before.pose)
  })
})

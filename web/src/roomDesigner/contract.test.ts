import { describe, expect, it } from 'vitest'
import { sampleRoom } from '../test/rooms'
import { RoomDesignRequest, parseRoomDesignIntent, roomSummary } from './contract'

const room = sampleRoom()
const intent = () => ({
  summary: 'A calmer room',
  rearrange: 'none' as const,
  removeObjectIds: [],
  replace: [],
  add: [{ category: 'sofa', count: 1 }],
  notes: [],
})

describe('room designer contract', () => {
  it('accepts a consented text request and redacts purchase and capture evidence', () => {
    const summary = roomSummary(room)
    expect(RoomDesignRequest.safeParse({ brief: 'Make it cozy', consent: true, baseRevision: 3, roomSummary: summary }).success).toBe(true)
    const encoded = JSON.stringify(summary)
    expect(encoded).not.toContain('raw')
    expect(encoded).not.toContain('offerId')
    expect(encoded).not.toContain('variantId')
    expect(encoded).not.toContain('photoRef')
    expect(Object.keys(summary).sort()).toEqual(['finishes', 'floorBounds', 'floorPolygon', 'id', 'objects', 'openings', 'walls'])
  })

  it.each(['', '   ', 'x'.repeat(601)])('rejects blank or overlong brief', (brief) => {
    expect(RoomDesignRequest.safeParse({ brief, consent: true, baseRevision: 0, roomSummary: roomSummary(room) }).success).toBe(false)
  })

  it('requires consent and a valid money budget', () => {
    const base = { brief: 'Try chairs', baseRevision: 0, roomSummary: roomSummary(room) }
    expect(RoomDesignRequest.safeParse({ ...base, consent: false }).success).toBe(false)
    expect(RoomDesignRequest.safeParse({ ...base, consent: true, budget: { amountMinor: 100.5, currency: 'USD' } }).success).toBe(false)
    expect(RoomDesignRequest.safeParse({ ...base, consent: true, budget: { amountMinor: 100, currency: 'USD' } }).success).toBe(true)
  })

  it('accepts a bounded high-level intent', () => {
    expect(parseRoomDesignIntent(intent(), room)).toEqual(intent())
    expect(parseRoomDesignIntent({ ...intent(), add: [{ category: 'sectional', count: 1 }, { category: 'dining-chair', count: 2 }] }, room).add).toHaveLength(2)
    expect(parseRoomDesignIntent({ ...intent(), add: [{ category: 'chair', count: 1 }, { category: 'table', count: 1 }] }, room).add).toHaveLength(2)
  })

  it('rejects aggregate additions and replacements over 12', () => {
    const objectId = room.objects[0]!.id
    expect(() => parseRoomDesignIntent({ ...intent(), add: [{ category: 'sofa', count: 8 }], replace: [{ objectId, category: 'rug', count: 5 }] }, room)).toThrow()
  })

  it('rejects unknown and duplicate object references', () => {
    const objectId = room.objects[0]!.id
    expect(() => parseRoomDesignIntent({ ...intent(), removeObjectIds: ['missing'] }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), removeObjectIds: [objectId, objectId] }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), removeObjectIds: [objectId], replace: [{ objectId, category: 'sofa', count: 1 }] }, room)).toThrow()
  })

  it('rejects unsupported categories and generated facts or commands', () => {
    expect(() => parseRoomDesignIntent({ ...intent(), add: [{ category: 'spaceship', count: 1 }] }, room)).toThrow()
    for (const field of ['position', 'price', 'url', 'floorPolygon', 'commands']) {
      expect(() => parseRoomDesignIntent({ ...intent(), [field]: field === 'url' ? 'https://example.com' : {} }, room)).toThrow()
    }
    expect(() => parseRoomDesignIntent({ ...intent(), add: [{ category: 'sofa', count: 1, dimensions: { width: 2 } }] }, room)).toThrow()
  })

  it('requires a color only for set palette', () => {
    expect(() => parseRoomDesignIntent({ ...intent(), palette: { mode: 'set' } }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), palette: { mode: 'darken', color: '#000000' } }, room)).toThrow()
    expect(parseRoomDesignIntent({ ...intent(), palette: { mode: 'set', color: '#000000' } }, room).palette).toEqual({ mode: 'set', color: '#000000' })
  })

  it('bounds explanations, notes and serialized output', () => {
    expect(() => parseRoomDesignIntent({ ...intent(), summary: 'x'.repeat(301) }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), notes: Array(13).fill('note') }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), notes: ['x'.repeat(301)] }, room)).toThrow()
    const oversized = { ...intent(), removeObjectIds: Array.from({ length: 100 }, (_, index) => `${'x'.repeat(297)}${index.toString().padStart(3, '0')}`) }
    expect(() => parseRoomDesignIntent(oversized, room)).toThrow('exceeds 24 KB')
  })
})

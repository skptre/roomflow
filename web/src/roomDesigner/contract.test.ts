import { describe, expect, it } from 'vitest'
import { sampleRoom } from '../test/rooms'
import { z } from 'zod'
import { RoomDesignIntentWire, RoomDesignRequest, describeRoomDesignIntent, parseRoomDesignIntent, parseRoomDesignResponse, roomSummary } from './contract'

const room = sampleRoom()
const intent = () => ({
  rearrange: 'none' as const,
  removeObjectIds: [],
  replace: [],
  add: [{ category: 'sofa', count: 1 }],
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

  it('accepts an optional boolean allowKeptChanges flag and rejects other types', () => {
    const base = { brief: 'Remove everything', consent: true, baseRevision: 0, roomSummary: roomSummary(room) }
    expect(RoomDesignRequest.safeParse(base).success).toBe(true)
    expect(RoomDesignRequest.safeParse({ ...base, allowKeptChanges: true }).success).toBe(true)
    expect(RoomDesignRequest.safeParse({ ...base, allowKeptChanges: false }).success).toBe(true)
    for (const value of ['true', 1, null, {}]) expect(RoomDesignRequest.safeParse({ ...base, allowKeptChanges: value }).success).toBe(false)
    expect(RoomDesignRequest.safeParse({ ...base, allowKept: true }).success).toBe(false)
  })

  it('marks kept pieces as not kept in the summary only when kept changes are allowed, leaving locks alone', () => {
    const kept = { ...room, objects: room.objects.map((object, index) => ({ ...object, keep: true, lockPlacement: index === 0 })) }
    expect(roomSummary(kept).objects.every((object) => object.keep)).toBe(true)
    expect(roomSummary(kept, { allowKeptChanges: false }).objects.every((object) => object.keep)).toBe(true)
    const allowed = roomSummary(kept, { allowKeptChanges: true })
    expect(allowed.objects.some((object) => object.keep)).toBe(false)
    expect(allowed.objects.map((object) => object.lockPlacement)).toEqual(kept.objects.map((object) => object.lockPlacement))
    expect(kept.objects.every((object) => object.keep)).toBe(true)
  })

  it('accepts a bounded high-level intent', () => {
    expect(parseRoomDesignIntent(intent(), room)).toEqual(intent())
    expect(parseRoomDesignIntent({ ...intent(), add: [{ category: 'sectional', count: 1 }, { category: 'dining-chair', count: 2 }] }, room).add).toHaveLength(2)
    expect(() => parseRoomDesignIntent({ ...intent(), add: [{ category: 'chair', count: 1 }] }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), add: [{ category: 'table', count: 1 }] }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), replace: [{ objectId: room.objects[0]!.id, category: 'closet', count: 1 }] }, room)).toThrow()
  })

  it('rejects aggregate additions and replacements over 12', () => {
    const objectId = room.objects[0]!.id
    expect(() => parseRoomDesignIntent({ ...intent(), add: [{ category: 'sofa', count: 8 }], replace: [{ objectId, category: 'rug', count: 5 }] }, room)).toThrow()
  })

  it('rejects unknown and duplicate object references', () => {
    const objectId = room.objects[0]!.id
    expect(() => parseRoomDesignIntent({ ...intent(), removeObjectIds: ['missing'] }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), removeObjectIds: [objectId, objectId] }, room)).toThrow()
  })

  it('keeps the replacement when the model sends one ID to both remove and replace', () => {
    const objectId = room.objects[0]!.id
    const other = room.objects[1]!.id
    const parsed = parseRoomDesignIntent({ ...intent(), removeObjectIds: [objectId, other], replace: [{ objectId, category: 'sofa', count: 1 }] }, room)
    expect(parsed.removeObjectIds).toEqual([other])
    expect(parsed.replace).toEqual([{ objectId, category: 'sofa', count: 1 }])
  })

  it('rejects unsupported categories and generated facts or commands', () => {
    expect(() => parseRoomDesignIntent({ ...intent(), add: [{ category: 'spaceship', count: 1 }] }, room)).toThrow()
    for (const field of ['position', 'price', 'url', 'floorPolygon', 'commands']) {
      expect(() => parseRoomDesignIntent({ ...intent(), [field]: field === 'url' ? 'https://example.com' : {} }, room)).toThrow()
    }
    expect(() => parseRoomDesignIntent({ ...intent(), add: [{ category: 'sofa', count: 1, dimensions: { width: 2 } }] }, room)).toThrow()
  })

  it('requires a valid color for set palette and normalizes harmless variations', () => {
    const palette = (value: unknown) => parseRoomDesignIntent({ ...intent(), palette: value }, room).palette
    expect(() => palette({ mode: 'set' })).toThrow()
    for (const color of ['black', '#12345', '#GGGGGG', '000000', '#0000000', '']) expect(() => palette({ mode: 'set', color })).toThrow()
    expect(() => palette({ mode: 'blacken' })).toThrow()
    expect(palette({ mode: 'set', color: '#000000' })).toEqual({ mode: 'set', color: '#000000' })
    expect(palette({ mode: 'set', color: '#000' })).toEqual({ mode: 'set', color: '#000000' })
    expect(palette({ mode: 'set', color: '#AbC' })).toEqual({ mode: 'set', color: '#aabbcc' })
    expect(palette({ mode: 'set', color: '#1A2B3C' })).toEqual({ mode: 'set', color: '#1a2b3c' })
    expect(palette({ mode: 'darken', color: '#000000' })).toEqual({ mode: 'darken' })
    expect(palette({ mode: 'preserve', color: 'not a color' })).toEqual({ mode: 'preserve' })
  })

  it('exposes a wire schema without keywords Gemini ignores', () => {
    const encoded = JSON.stringify(z.toJSONSchema(RoomDesignIntentWire))
    for (const keyword of ['oneOf', 'anyOf', 'allOf', '"not"', '"const"', '"pattern"', 'minLength', 'maxLength']) expect(encoded).not.toContain(keyword)
  })

  it('bounds serialized model output', () => {
    const oversized = { ...intent(), removeObjectIds: Array.from({ length: 100 }, (_, index) => `${'x'.repeat(297)}${index.toString().padStart(3, '0')}`) }
    expect(() => parseRoomDesignIntent(oversized, room)).toThrow('exceeds 24 KB')
  })

  it.each(['costs four hundred dollars', 'two metres wide', 'retailer.shop/sofa', 'Delete the chair', 'A calmer room'])('rejects all model prose fields: %s', (claim) => {
    expect(() => parseRoomDesignIntent({ ...intent(), summary: claim, notes: [] }, room)).toThrow()
    expect(() => parseRoomDesignIntent({ ...intent(), summary: 'A calmer room', notes: [claim] }, room)).toThrow()
  })

  it('describes validated intent using neutral local copy, even with untrusted room labels', () => {
    const alteredRoom = { ...room, objects: [{ ...room.objects[0]!, id: 'item-a', name: 'costs four hundred dollars', category: 'retailer.shop/sofa' }, ...room.objects.slice(1)] }
    const plan = parseRoomDesignIntent({ ...intent(), palette: { mode: 'set', color: '#000000' }, rearrange: 'full', removeObjectIds: ['item-a'], add: [{ category: 'lounge-chair', count: 2 }] }, alteredRoom)
    const description = describeRoomDesignIntent(plan, alteredRoom)
    expect(description.summary).toBe('Requested room design with palette, layout, and furniture changes.')
    expect(description.notes).toContain('Addition requests: 2 lounge chairs.')
    expect(description.notes).toContain('Removal requests: 1 existing item.')
    const copy = JSON.stringify(description)
    for (const claim of ['costs four hundred dollars', 'two metres wide', 'retailer.shop/sofa', 'Delete the chair']) expect(copy).not.toContain(claim)
  })

  it('validates the response envelope through the current room and byte cap', () => {
    expect(parseRoomDesignResponse({ intent: intent() }, room)).toEqual({ intent: intent() })
    expect(() => parseRoomDesignResponse({ intent: { ...intent(), removeObjectIds: ['missing'] } }, room)).toThrow()
    expect(() => parseRoomDesignResponse({ intent: intent(), price: 499 }, room)).toThrow()
    const oversized = { ...intent(), removeObjectIds: Array.from({ length: 100 }, (_, index) => `${'x'.repeat(297)}${index.toString().padStart(3, '0')}`) }
    expect(() => parseRoomDesignResponse({ intent: oversized }, room)).toThrow('exceeds 24 KB')
  })
})

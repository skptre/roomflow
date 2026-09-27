import { describe, expect, it } from 'vitest'
import { lamp, sampleRoom } from '../test/rooms'
import { placedLamps } from './lightSources'

describe('placedLamps', () => {
  it('lights placed lamps without treating scanned objects as detected fixtures', () => {
    const room = sampleRoom()
    const placed = lamp()
    const captured = { ...lamp('captured-lamp'), sourceKind: 'captured' as const }
    const chair = { ...lamp('chair'), category: 'chair' }
    room.objects.push(placed, captured, chair)

    expect(placedLamps(room).map((object) => object.id)).toEqual([placed.id])
  })
})

import { describe, expect, it } from 'vitest'
import { originalRoom } from './originalRoom'

describe('originalRoom landing preview', () => {
  it('uses the first tiny bedroom with just a bed and desk', () => {
    const result = originalRoom()
    if (!result.ok) throw new Error(result.error)
    const x = result.room.floorPolygon.map((point) => point.x)
    const z = result.room.floorPolygon.map((point) => point.z)
    expect(Math.max(...x) - Math.min(...x)).toBeCloseTo(4)
    expect(Math.max(...z) - Math.min(...z)).toBeCloseTo(3.5)
    expect(result.room.objects.map((object) => object.name)).toEqual(['Bed', 'Desk'])
  })
})

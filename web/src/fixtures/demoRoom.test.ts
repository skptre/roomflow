import { describe, expect, it } from 'vitest'
import { modelFor } from '../blocks/build'
import { recipeForAsset } from '../blocks/registry'
import { collisions } from '../domain/commands'
import { footprint, insideRoom } from '../domain/geometry'
import { blocksDoorway } from '../domain/layout'
import { purchaseSummary } from '../domain/purchases'
import { zoneAt } from '../scene/zonePaint'
import { DEMO_RECIPES, demoRoom } from './demoRoom'

function room() {
  const result = demoRoom({ now: '2026-09-27T00:00:00.000Z' })
  if (!result.ok) throw new Error(result.error)
  return result
}

const BATHROOM_PIECES = ['OBJ-TUB', 'OBJ-VANITY', 'OBJ-TOILET', 'DECOR-MIRROR', 'DECOR-BATH-MAT', 'DECOR-PLANT-BATH']

describe('demoRoom', () => {
  it('imports two rooms joined by a door, the wall between them interior', () => {
    const { room: home, warnings } = room()
    expect(warnings).toEqual([])
    expect(home.name).toBe('Sample home')
    expect(home.walls.filter((wall) => !wall.exterior).map((wall) => wall.id)).toEqual(['WALL-BETWEEN'])
    expect(home.openings.find((opening) => opening.id === 'DOOR-BATH')?.wallId).toBe('WALL-BETWEEN')
    expect(home.zones?.map((zone) => zone.name)).toEqual(['Bathroom'])
  })

  it('finishes each room differently: carpet and color in the bedroom, white tile in the bathroom', () => {
    const { room: home } = room()
    const bathroom = home.zones![0]!
    expect(home.finishes.floorTexture).toBe('plain')
    expect(bathroom.finishes.floorTexture).toBe('tile')
    expect(bathroom.finishes.wall).not.toBe(home.finishes.wall)
    expect(bathroom.finishes.floor).not.toBe(home.finishes.floor)
  })

  it('puts the bathroom pieces in the bathroom and everything else in the bedroom', () => {
    const { room: home } = room()
    for (const object of home.objects) {
      const inBathroom = footprint(object).every((corner) => zoneAt(home, corner)?.name === 'Bathroom')
      const inBedroom = footprint(object).every((corner) => zoneAt(home, corner) === null)
      if (BATHROOM_PIECES.includes(object.id)) expect(inBathroom, object.id).toBe(true)
      else expect(inBedroom, object.id).toBe(true)
    }
  })

  it('starts at $0: every piece is already the owner’s', () => {
    const { room: home } = room()
    expect(home.objects.every((object) => object.sourceKind === 'captured' || object.sourceKind === 'owned')).toBe(true)
    const summary = purchaseSummary(home, { offers: new Map() }, null)
    expect(summary.lines).toEqual([])
    expect(summary.ownedCount).toBe(home.objects.length)
  })

  it('draws every piece with a recipe that builds', () => {
    const { room: home } = room()
    for (const object of home.objects) {
      if (object.asset.kind !== 'recipe') throw new Error(`${object.id} has no recipe`)
      const recipe = recipeForAsset(object.asset, object.category)
      expect(recipe, object.id).toBeDefined()
      expect(modelFor(recipe!, object.dimensions).slots.length, object.id).toBeGreaterThan(0)
    }
    expect(new Set(DEMO_RECIPES.map((recipe) => recipe.id)).size).toBe(DEMO_RECIPES.length)
  })

  it('keeps everything inside, clear of each other and of the doorways', () => {
    const { room: home } = room()
    for (const object of home.objects) {
      expect(insideRoom(object, home.floorPolygon), object.id).toBe(true)
      expect(collisions(home, object).map((other) => other.id), object.id).toEqual([])
      if (object.pose.position.y === 0 && object.category !== 'rug') expect(blocksDoorway(home, object), object.id).toBe(false)
    }
  })

  it('hangs curtains at the desk window', () => {
    const { room: home } = room()
    const curtain = home.objects.find((object) => object.category === 'curtain')
    expect(curtain).toBeDefined()
    expect(zoneAt(home, curtain!.pose.position)).toBeNull()
  })
})

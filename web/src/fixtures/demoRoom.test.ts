import { describe, expect, it } from 'vitest'
import { modelFor } from '../blocks/build'
import { recipeForAsset } from '../blocks/registry'
import { collisions } from '../domain/commands'
import { insideRoom } from '../domain/geometry'
import { blocksDoorway } from '../domain/layout'
import { purchaseSummary } from '../domain/purchases'
import { DEMO_RECIPES, demoRoom } from './demoRoom'

function room() {
  const result = demoRoom({ now: '2026-09-27T00:00:00.000Z' })
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('demoRoom', () => {
  it('imports one small bedroom cleanly, with a door and a window', () => {
    const { room: bedroom, warnings } = room()
    expect(warnings).toEqual([])
    expect(bedroom.name).toBe('Sample bedroom')
    expect(bedroom.walls.every((wall) => wall.exterior)).toBe(true)
    expect(bedroom.openings.map((opening) => opening.kind).sort()).toEqual(['door', 'window'])
    expect(bedroom.zones).toBeUndefined()
  })

  it('stays sparse: a few pieces, one of each kind of decor', () => {
    const { room: bedroom } = room()
    expect(bedroom.objects.length).toBeLessThanOrEqual(10)
    const decor = bedroom.objects.filter((object) => object.sourceKind === 'owned').map((object) => object.category)
    expect(new Set(decor).size).toBe(decor.length)
  })

  it('starts at $0: every piece is already the owner’s', () => {
    const { room: bedroom } = room()
    expect(bedroom.objects.every((object) => object.sourceKind === 'captured' || object.sourceKind === 'owned')).toBe(true)
    const summary = purchaseSummary(bedroom, { offers: new Map() }, null)
    expect(summary.lines).toEqual([])
    expect(summary.ownedCount).toBe(bedroom.objects.length)
  })

  it('draws every piece with a sample recipe that builds', () => {
    const { room: bedroom } = room()
    for (const object of bedroom.objects) {
      if (object.asset.kind !== 'recipe') throw new Error(`${object.id} has no recipe`)
      expect(object.asset.recipeId, object.id).toMatch(/^demo:/)
      const recipe = recipeForAsset(object.asset, object.category)
      expect(recipe, object.id).toBeDefined()
      expect(modelFor(recipe!, object.dimensions).slots.length, object.id).toBeGreaterThan(0)
    }
    expect(new Set(DEMO_RECIPES.map((recipe) => recipe.id)).size).toBe(DEMO_RECIPES.length)
  })

  it('keeps everything inside, clear of each other and of the doorway', () => {
    const { room: bedroom } = room()
    for (const object of bedroom.objects) {
      expect(insideRoom(object, bedroom.floorPolygon), object.id).toBe(true)
      expect(collisions(bedroom, object).map((other) => other.id), object.id).toEqual([])
      if (object.pose.position.y === 0 && object.category !== 'rug') expect(blocksDoorway(bedroom, object), object.id).toBe(false)
    }
  })

  it('hangs curtains at the window', () => {
    const { room: bedroom } = room()
    expect(bedroom.objects.some((object) => object.category === 'curtain')).toBe(true)
  })
})

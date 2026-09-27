/** Test-only room and object builders shared by domain tests. */
import fixtureText from '../fixtures/synthetic-bedroom.roomplan.json?raw'
import type { Room, RoomObject } from '../domain/schema'
import { parseRoomPlanJson } from '../import/roomplan'

export function sampleRoom(): Room {
  const result = parseRoomPlanJson(fixtureText, { now: '2026-09-26T00:00:00.000Z' })
  if (!result.ok) throw new Error(result.error)
  return result.room
}

/** A purchasable product object (sample offer id o-lamp). */
export function lamp(id = 'lamp-1', x = 0, z = 0): RoomObject {
  return {
    id,
    name: 'Floor lamp',
    category: 'floor-lamp',
    sourceKind: 'product',
    dimensions: { width: 0.4, height: 1.6, depth: 0.4, source: 'merchant' },
    pose: { position: { x, y: 0, z }, yaw: 0 },
    asset: { kind: 'recipe', recipeId: 'default:floor-lamp' },
    fidelity: 'approximate',
    variantId: 'v-lamp',
    offerId: 'o-lamp',
    quantity: 1,
    keep: false,
    lockPlacement: false,
  }
}

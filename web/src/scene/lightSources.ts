import type { Room } from '../domain/schema'

/** Captured objects are not evidence that a scan detected an illuminated fixture. */
export function placedLamps(room: Room) {
  return room.objects.filter(
    (object) =>
      (object.category === 'floor-lamp' || object.category === 'table-lamp') &&
      object.sourceKind !== 'captured',
  )
}

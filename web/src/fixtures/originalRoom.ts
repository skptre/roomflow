/** The tiny first Roomflow bedroom, used only as a non-interactive landing preview. */
import originalScan from './synthetic-bedroom.roomplan.json?raw'
import { parseRoomPlanJson, type ImportResult } from '../import/roomplan'
import './demoRoom'

/** Restore the first synthetic 4 × 3.5 m room with only its bed and desk on display. */
export function originalRoom(): ImportResult {
  // Importing the sample fixture registers the same bed and desk recipes.
  const result = parseRoomPlanJson(originalScan, { name: 'Original bedroom preview' })
  if (!result.ok) return result
  return {
    ...result,
    room: {
      ...result.room,
      objects: result.room.objects
        .filter((object) => object.id === 'OBJ-BED' || object.id === 'OBJ-DESK')
        .map((object) => ({
          ...object,
          name: object.id === 'OBJ-BED' ? 'Bed' : 'Desk',
          category: object.id === 'OBJ-BED' ? 'bed' : 'desk',
          asset: { kind: 'recipe' as const, recipeId: object.id === 'OBJ-BED' ? 'demo:bed' : 'demo:desk' },
        })),
    },
  }
}

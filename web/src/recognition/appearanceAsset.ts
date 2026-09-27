import { recipeAsset } from '../blocks/registry'
import type { AssetRef } from '../domain/schema'
import type { Appearance } from './contract'

/** Only authored recipe families and colors; no generated code, geometry or URLs. */
export function appearanceAsset(value: Appearance): AssetRef {
  if (value.template === 'unsupported') return { kind: 'placeholder' }
  const category = ({ armchair: 'lounge-chair', loveseat: 'sofa' } as const)[value.template as 'armchair' | 'loveseat'] ?? value.template
  // Recipes ignore slots that a family does not expose. This gives each known
  // family its safe colorable surfaces without inventing a product match.
  return recipeAsset(category, {
    upholstery: value.color,
    seat: value.color,
    back: value.backColor,
    frame: value.color,
    top: value.color,
  })
}

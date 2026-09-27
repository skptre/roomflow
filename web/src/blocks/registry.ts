/**
 * Recipes by id: a built-in default per category (`default:<category>`) and
 * product recipes registered at runtime (M3). Captured furniture and anything
 * without its own recipe is drawn with its category's default.
 */
import type { AssetRef } from '../domain/schema'
import { validateRecipe, type Recipe } from './recipe'

type Shape = Pick<Recipe, 'family' | 'blocks' | 'params'> & Partial<Pick<Recipe, 'materialKind' | 'defaultColors'>>

/**
 * Default shape per category. Colors stay the family's neutral defaults so a
 * default never claims a finish the product doesn't have.
 */
const DEFAULTS: Readonly<Record<string, Shape>> = {
  sofa: { family: 'sofa', blocks: {}, params: {} },
  sectional: { family: 'sofa', blocks: { shape: 'L-right' }, params: {} },
  'lounge-chair': { family: 'chair', blocks: { back: 'pillow' }, params: {} },
  ottoman: { family: 'chair', blocks: { form: 'ottoman' }, params: {} },
  bench: { family: 'chair', blocks: { form: 'bench' }, params: {} },
  bed: { family: 'bed', blocks: {}, params: {} },
  nightstand: { family: 'storage', blocks: { layout: 'drawer-shelf' }, params: {} },
  dresser: { family: 'storage', blocks: { layout: 'drawers' }, params: { cols: 2 } },
  cabinet: { family: 'storage', blocks: { layout: 'doors', handles: 'bar' }, params: {} },
  bookshelf: { family: 'storage', blocks: { layout: 'shelves', base: 'plinth', handles: 'none' }, params: {} },
  'coffee-table': { family: 'table', blocks: { top: 'rounded' }, params: { topThickness: 0.04 } },
  'side-table': { family: 'table', blocks: { top: 'round', base: 'pedestal' }, params: {} },
  'dining-table': { family: 'table', blocks: { legStyle: 'straight' }, params: { legInset: 0.06 } },
  desk: { family: 'table', blocks: { drawer: '1' }, params: { topThickness: 0.028 } },
  console: { family: 'table', blocks: { legStyle: 'straight', shelf: 'lower' }, params: { topThickness: 0.028 } },
  'dining-chair': { family: 'dining-chair', blocks: {}, params: {} },
  'desk-chair': { family: 'dining-chair', blocks: { seat: 'cushion', back: 'upholstered', base: 'pedestal-star' }, params: {} },
  'floor-lamp': { family: 'lamp', blocks: { base: 'disc' }, params: {} },
  'table-lamp': { family: 'lamp', blocks: { base: 'round' }, params: {} },
  rug: { family: 'rug', blocks: {}, params: {} },
  plant: { family: 'planter', blocks: { plant: 'fiddle' }, params: {} },
  planter: { family: 'planter', blocks: { plant: 'none' }, params: {} },
  'wall-art': { family: 'art', blocks: {}, params: {} },
  mirror: { family: 'mirror', blocks: {}, params: {} },
  // Reserved for a normal-depth closet. RoomPlan door planes use placeholders.
  closet: { family: 'storage', blocks: { layout: 'doors', handles: 'bar', base: 'plinth' }, params: {} },
  vase: { family: 'vase', blocks: {}, params: {} },
  'decor-object': { family: 'vase', blocks: { profile: 'sphere' }, params: {} },
  curtain: { family: 'curtain', blocks: {}, params: {} },
  pillow: { family: 'pillow', blocks: {}, params: {} },
  throw: { family: 'throw', blocks: {}, params: {} },
  // RoomPlan capture categories (existing furniture in a scanned room).
  table: { family: 'table', blocks: {}, params: {} },
  chair: { family: 'dining-chair', blocks: {}, params: {} },
  storage: { family: 'storage', blocks: { layout: 'drawers' }, params: { cols: 2 } },
}

const recipes = new Map<string, Recipe>()

function register(recipe: Recipe) {
  const result = validateRecipe(recipe)
  if (!result.ok) throw new Error(`Recipe ${recipe.id}: ${result.error}`)
  recipes.set(result.recipe.id, result.recipe)
}

for (const [category, shape] of Object.entries(DEFAULTS)) {
  register({ schemaVersion: 1, id: `default:${category}`, tier: 'default', ...shape })
}

/** The built-in recipe id for a category, or null when we have no block model for it. */
export function defaultRecipeId(category: string): string | null {
  return Object.hasOwn(DEFAULTS, category) ? `default:${category}` : null
}

export function getRecipe(id: string): Recipe | undefined {
  return recipes.get(id)
}

/** Add product recipes (validated; an invalid one throws rather than rendering something wrong). */
export function registerRecipes(list: readonly Recipe[]) {
  for (const recipe of list) register(recipe)
}

/** The recipe to draw: the one named, else the category's default. */
export function resolveRecipe(recipeId: string, category: string): Recipe | undefined {
  const own = recipes.get(recipeId)
  if (own) return own
  const fallback = defaultRecipeId(category)
  return fallback ? recipes.get(fallback) : undefined
}

const variantRecipes = new Map<string, Recipe>()

/**
 * The recipe to draw for an asset: its recipe (or the category default) with
 * this variant's block choices and photo applied. Same inputs give the same
 * object (so memoized views and the model cache see no change); choices the
 * family doesn't have are ignored rather than drawn.
 */
export function recipeForAsset(asset: Extract<AssetRef, { kind: 'recipe' }>, category: string): Recipe | undefined {
  const base = resolveRecipe(asset.recipeId, category)
  if (!base || (!asset.blocks && !asset.imageUrl)) return base
  const key = JSON.stringify([base.id, asset.blocks ?? null, asset.imageUrl ?? null])
  const cached = variantRecipes.get(key)
  if (cached) return cached
  const image = asset.imageUrl && base.image ? { url: asset.imageUrl } : base.image
  const merged = validateRecipe({ ...base, blocks: { ...base.blocks, ...asset.blocks }, ...(image ? { image } : {}) })
  const recipe = merged.ok ? merged.recipe : base
  if (variantRecipes.size > 2000) variantRecipes.clear()
  variantRecipes.set(key, recipe)
  return recipe
}

/** The asset for an object of a category drawn with its default recipe (placeholder when we can't draw it). */
export function recipeAsset(category: string, colors?: Record<string, string>): AssetRef {
  const recipeId = defaultRecipeId(category)
  if (!recipeId) return { kind: 'placeholder' }
  return colors ? { kind: 'recipe', recipeId, colors } : { kind: 'recipe', recipeId }
}

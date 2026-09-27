/**
 * Recipe (schemaVersion 1): how one product is drawn from blocks — its
 * family, block choices, bounded params, slot materials, and colors. Recipes
 * are plain data (hand-written defaults, keyword rules, or model output) and
 * all pass the same validator before anything is built from them.
 */
import { z } from 'zod'
import { MaterialKind } from './family'
import { getFamily } from './families'

const Hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((value) => value.toLowerCase())

const Name = z.string().min(1).max(64)

export const Recipe = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(200),
  productId: z.string().min(1).max(200).optional(),
  family: Name,
  blocks: z.record(Name, Name).default({}),
  params: z.record(Name, z.number()).default({}),
  /** Material per slot where it differs from the family's (e.g. metal legs, leather upholstery). */
  materialKind: z.record(Name, MaterialKind).optional(),
  defaultColors: z.record(Name, Hex).optional(),
  /**
   * Store option → option value → the slot colors that value sets, applied per
   * variant over defaultColors. One value can paint several slots ("Ivory / Walnut").
   */
  optionColors: z.record(z.string().min(1).max(100), z.record(z.string().min(1).max(200), z.record(Name, Hex))).optional(),
  /** Store option → option value → block choices that value makes ("Arm Style: Round" → rolled arms). */
  optionBlocks: z.record(z.string().min(1).max(100), z.record(z.string().min(1).max(200), z.record(Name, Name))).optional(),
  /** The product's own photo, for families that show it (art canvas, rug top). https only. */
  image: z.strictObject({ url: z.url({ protocol: /^https$/ }) }).optional(),
  tier: z.enum(['default', 'rules', 'gemini']),
  generator: z.strictObject({ model: z.string().max(100).optional(), version: z.string().max(40) }).optional(),
  evidence: z.strictObject({ colors: z.enum(['photo', 'name', 'default']), shape: z.enum(['matched', 'default']) }).optional(),
  /** Features the blocks can't express yet (drives new blocks). */
  unmatched: z.array(z.string().max(80)).max(20).optional(),
})
export type Recipe = z.infer<typeof Recipe>

export type RecipeResult = { ok: true; recipe: Recipe } | { ok: false; error: string }

/** Parse a recipe and check every block, param, slot, and image against its family. */
export function validateRecipe(input: unknown): RecipeResult {
  const parsed = Recipe.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    return { ok: false, error: `Invalid recipe at ${issue.path.join('.') || 'root'}: ${issue.message}` }
  }
  const recipe = parsed.data
  const family = getFamily(recipe.family)
  if (!family) return { ok: false, error: `Unknown family "${recipe.family}"` }

  const blockChoices = [
    ...Object.entries(recipe.blocks),
    ...Object.values(recipe.optionBlocks ?? {}).flatMap((values) => Object.values(values).flatMap((blocks) => Object.entries(blocks))),
  ]
  for (const [name, value] of blockChoices) {
    const spec = Object.hasOwn(family.blocks, name) ? family.blocks[name] : undefined
    if (!spec) return { ok: false, error: `${family.id} has no block "${name}"` }
    if (!spec.options.includes(value)) return { ok: false, error: `${family.id} block "${name}" has no option "${value}"` }
  }
  for (const [name, value] of Object.entries(recipe.params)) {
    const spec = Object.hasOwn(family.params, name) ? family.params[name] : undefined
    if (!spec) return { ok: false, error: `${family.id} has no param "${name}"` }
    if (value < spec.min || value > spec.max) return { ok: false, error: `${family.id} param "${name}" must be within ${spec.min}–${spec.max}` }
    if (spec.integer && !Number.isInteger(value)) return { ok: false, error: `${family.id} param "${name}" must be a whole number` }
  }
  const slots = [
    ...Object.keys(recipe.materialKind ?? {}),
    ...Object.keys(recipe.defaultColors ?? {}),
    ...Object.values(recipe.optionColors ?? {}).flatMap((values) => Object.values(values).flatMap((colors) => Object.keys(colors))),
  ]
  for (const slot of slots) {
    if (!Object.hasOwn(family.slots, slot)) return { ok: false, error: `${family.id} has no slot "${slot}"` }
  }
  if (recipe.image && !family.imageSlot) return { ok: false, error: `${family.id} can't show a product image` }
  return { ok: true, recipe }
}

/**
 * Slot colors for one variant: the recipe's defaults, then each chosen option
 * value's colors (options matched by name). Undefined when the recipe names no
 * colors, so the family's neutral defaults apply.
 */
export function variantColors(
  recipe: Pick<Recipe, 'defaultColors' | 'optionColors'>,
  optionNames: readonly string[],
  optionValues: readonly string[],
): Record<string, string> | undefined {
  const colors: Record<string, string> = { ...recipe.defaultColors }
  optionNames.forEach((name, index) => {
    const values = recipe.optionColors && Object.hasOwn(recipe.optionColors, name) ? recipe.optionColors[name] : undefined
    const value = optionValues[index]
    if (values && value !== undefined && Object.hasOwn(values, value)) Object.assign(colors, values[value])
  })
  return Object.keys(colors).length > 0 ? colors : undefined
}

/** The recipe's blocks with one variant's option choices applied, or undefined when they change nothing. */
export function variantBlocks(
  recipe: Pick<Recipe, 'blocks' | 'optionBlocks'>,
  optionNames: readonly string[],
  optionValues: readonly string[],
): Record<string, string> | undefined {
  let changed = false
  const blocks: Record<string, string> = { ...recipe.blocks }
  optionNames.forEach((name, index) => {
    const values = recipe.optionBlocks && Object.hasOwn(recipe.optionBlocks, name) ? recipe.optionBlocks[name] : undefined
    const value = optionValues[index]
    if (!values || value === undefined || !Object.hasOwn(values, value)) return
    for (const [block, option] of Object.entries(values[value]!)) {
      if (blocks[block] !== option) changed = true
      blocks[block] = option
    }
  })
  return changed ? blocks : undefined
}

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
  /** Store option → the slot it colors and a color per option value (applied per variant). */
  optionColors: z
    .record(z.string().min(1).max(100), z.strictObject({ slot: Name, values: z.record(z.string().min(1).max(200), Hex) }))
    .optional(),
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

  for (const [name, value] of Object.entries(recipe.blocks)) {
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
    ...Object.values(recipe.optionColors ?? {}).map((option) => option.slot),
  ]
  for (const slot of slots) {
    if (!Object.hasOwn(family.slots, slot)) return { ok: false, error: `${family.id} has no slot "${slot}"` }
  }
  if (recipe.image && !family.imageSlot) return { ok: false, error: `${family.id} can't show a product image` }
  return { ok: true, recipe }
}

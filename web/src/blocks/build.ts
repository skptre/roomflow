/**
 * Recipe → geometry. A family's build composes kit blocks per material slot;
 * this module resolves block choices and params (defaults, clamping) and runs it.
 */
import { BufferAttribute } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BuildContext, Family, MaterialKind, Size } from './family'
import { getFamily } from './families'
import type { Geo } from './kit'
import type { Recipe } from './recipe'

export type ResolvedShape = { blocks: Record<string, string>; params: Record<string, number> }

/** Block choices and params with family defaults filled in and values clamped to their ranges. */
export function resolveShape(
  family: Family,
  size: Size,
  blocks: Readonly<Record<string, string>>,
  params: Readonly<Record<string, number>>,
): ResolvedShape {
  const resolvedBlocks: Record<string, string> = {}
  for (const [name, spec] of Object.entries(family.blocks)) {
    const given = Object.hasOwn(blocks, name) ? blocks[name] : undefined
    resolvedBlocks[name] =
      given !== undefined && spec.options.includes(given) ? given : typeof spec.default === 'function' ? spec.default(size) : spec.default
  }
  const resolvedParams: Record<string, number> = {}
  for (const [name, spec] of Object.entries(family.params)) {
    const given = Object.hasOwn(params, name) ? params[name] : undefined
    let value = given !== undefined && Number.isFinite(given) ? given : typeof spec.default === 'function' ? spec.default(size, resolvedBlocks) : spec.default
    value = Math.min(spec.max, Math.max(spec.min, value))
    resolvedParams[name] = spec.integer ? Math.round(value) : value
  }
  return { blocks: resolvedBlocks, params: resolvedParams }
}

export type BuiltParts = {
  parts: Map<string, Geo[]>
  /** Material hints from the build (e.g. metal legs) — recipe choices override these. */
  suggested: Map<string, { kind: MaterialKind; color?: string }>
  shape: ResolvedShape
}

/** Run a family's build at a size. Geometry is fresh; the caller owns and disposes it. */
export function buildParts(
  family: Family,
  size: Size,
  blocks: Readonly<Record<string, string>>,
  params: Readonly<Record<string, number>>,
): BuiltParts {
  const shape = resolveShape(family, size, blocks, params)
  const parts = new Map<string, Geo[]>()
  const suggested = new Map<string, { kind: MaterialKind; color?: string }>()
  const ctx: BuildContext = {
    w: size.width,
    h: size.height,
    d: size.depth,
    block: (name) => {
      const value = shape.blocks[name]
      if (value === undefined) throw new Error(`${family.id}: unknown block ${name}`)
      return value
    },
    param: (name) => {
      const value = shape.params[name]
      if (value === undefined) throw new Error(`${family.id}: unknown param ${name}`)
      return value
    },
    add: (slot, geometry) => {
      if (!Object.hasOwn(family.slots, slot)) throw new Error(`${family.id}: unknown slot ${slot}`)
      const list = parts.get(slot)
      if (list) list.push(geometry)
      else parts.set(slot, [geometry])
    },
    suggest: (slot, kind, color) => {
      suggested.set(slot, color ? { kind, color } : { kind })
    },
  }
  family.build(ctx)
  return { parts, suggested, shape }
}

export type Model = {
  key: string
  /** One merged geometry per material slot. Shared: never dispose it directly. */
  slots: Array<{ slot: string; geometry: Geo }>
  suggested: ReadonlyMap<string, { kind: MaterialKind; color?: string }>
}

type Entry = { model: Model; users: number }

const models = new Map<string, Entry>()
/** Released models kept for quick reuse (hovering back and forth), oldest first. */
const idle: string[] = []
const IDLE_LIMIT = 24

const mm = (value: number) => Math.round(value * 1000)

function modelKey(family: Family, size: Size, shape: ResolvedShape): string {
  return `${family.id}|${mm(size.width)}x${mm(size.height)}x${mm(size.depth)}|${JSON.stringify(shape)}`
}

function buildModel(family: Family, size: Size, recipe: Recipe, key: string): Model {
  const { parts, suggested } = buildParts(family, size, recipe.blocks, recipe.params)
  const slots: Model['slots'] = []
  for (const [slot, geometries] of parts) {
    const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries)
    if (!merged) throw new Error(`${family.id}: could not merge slot ${slot}`)
    if (geometries.length > 1) geometries.forEach((g) => g.dispose())
    merged.computeBoundingBox()
    merged.computeBoundingSphere()
    if (slot === family.imageSlot) projectUVs(merged, family.imageProjection ?? 'xy')
    slots.push({ slot, geometry: merged })
  }
  return { key, slots, suggested }
}

/**
 * Planar UVs over the slot's bounds (0..1), so a product photo covers the art
 * canvas (x→u, y→v) or the rug top (x→u, −z→v, i.e. the far edge is the top of the photo).
 */
function projectUVs(geometry: Geo, plane: 'xy' | 'xz') {
  const { min, max } = geometry.boundingBox!
  const position = geometry.getAttribute('position')
  const uv = new Float32Array(position.count * 2)
  const spanX = max.x - min.x || 1
  const spanV = plane === 'xy' ? max.y - min.y || 1 : max.z - min.z || 1
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = (position.getX(i) - min.x) / spanX
    uv[i * 2 + 1] = plane === 'xy' ? (position.getY(i) - min.y) / spanV : (max.z - position.getZ(i)) / spanV
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
}

/** Aspect ratio (width / height) of the image slot's face, for cropping a photo to cover it. */
export function imageAspect(recipe: Recipe, model: Model): number | null {
  const family = getFamily(recipe.family)
  const slot = family?.imageSlot ? model.slots.find((s) => s.slot === family.imageSlot) : undefined
  if (!slot) return null
  const { min, max } = slot.geometry.boundingBox!
  const v = family!.imageProjection === 'xz' ? max.z - min.z : max.y - min.y
  return v > 0 ? (max.x - min.x) / v : null
}

function dispose(key: string) {
  const entry = models.get(key)
  if (!entry) return
  entry.model.slots.forEach(({ geometry }) => geometry.dispose())
  models.delete(key)
}

/**
 * The merged model for a recipe at a size, shared by every user with the same
 * family, resolved shape, and size (colors and materials are not part of it).
 * Call release() when done; unused models linger in a small pool, then are freed.
 */
export function acquireModel(recipe: Recipe, size: Size): { model: Model; release: () => void } {
  const key = modelFor(recipe, size).key
  const entry = models.get(key)!
  const idleAt = idle.indexOf(key)
  if (idleAt >= 0) idle.splice(idleAt, 1)
  entry.users += 1
  let released = false
  const held = entry
  return {
    model: entry.model,
    release: () => {
      if (released) return
      released = true
      held.users -= 1
      if (held.users > 0 || models.get(key) !== held) return
      idle.push(key)
      trimIdle()
    },
  }
}

/**
 * The shared model without holding it (for render; hold it with acquireModel
 * in an effect). A model nobody holds waits in the idle pool.
 */
export function modelFor(recipe: Recipe, size: Size): Model {
  const family = getFamily(recipe.family)
  if (!family) throw new Error(`Unknown family "${recipe.family}"`)
  const shape = resolveShape(family, size, recipe.blocks, recipe.params)
  const key = modelKey(family, size, shape)
  const existing = models.get(key)
  if (existing) return existing.model
  const entry = { model: buildModel(family, size, recipe, key), users: 0 }
  models.set(key, entry)
  idle.push(key)
  trimIdle()
  return entry.model
}

function trimIdle() {
  while (idle.length > IDLE_LIMIT) dispose(idle.shift()!)
}

export function cachedModelCount(): number {
  return models.size
}

/** Free every cached model (e.g. when the 3D view unmounts). Models still in use stay. */
export function disposeIdleModels() {
  for (const key of idle.splice(0)) dispose(key)
}

export type SlotLook = { slot: string; geometry: Geo; kind: MaterialKind; color: string }

const HEX = /^#[0-9a-f]{6}$/i

/**
 * Material and color per slot. Kind: recipe > build suggestion > family.
 * Color: variant colors > recipe default > build suggestion (only when the
 * recipe didn't pick the material) > family default.
 */
export function slotLooks(recipe: Recipe, model: Model, colors?: Readonly<Record<string, string>>): SlotLook[] {
  const family = getFamily(recipe.family)
  if (!family) return []
  return model.slots.map(({ slot, geometry }) => {
    const spec = family.slots[slot]!
    const suggestion = model.suggested.get(slot)
    const ownKind = recipe.materialKind?.[slot]
    const explicit = colors && Object.hasOwn(colors, slot) ? colors[slot] : undefined
    const color =
      (explicit && HEX.test(explicit) ? explicit : undefined) ??
      recipe.defaultColors?.[slot] ??
      (ownKind ? undefined : suggestion?.color) ??
      spec.color
    return { slot, geometry, kind: ownKind ?? suggestion?.kind ?? spec.kind, color: color.toLowerCase() }
  })
}

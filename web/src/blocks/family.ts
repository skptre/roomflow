/**
 * A furniture family: the block choices, bounded proportions, and material
 * slots it exposes, plus a pure build function that composes kit geometry
 * inside the object's box. Box convention (see domain/units): origin at the
 * bottom-center, x ∈ [−w/2, w/2], y ∈ [0, h], z ∈ [−d/2, d/2], front faces +Z.
 */
import { z } from 'zod'
import type { Geo } from './kit'

export const MaterialKind = z.enum(['fabric', 'leather', 'wood', 'metal', 'ceramic', 'glass', 'stone', 'plant', 'paper', 'mirror'])
export type MaterialKind = z.infer<typeof MaterialKind>

export type Size = { width: number; height: number; depth: number }

export type BlockSpec = { options: readonly string[]; default: string | ((size: Size) => string) }

export type ParamSpec = {
  min: number
  max: number
  /** A number, or one derived from the size and the chosen blocks. */
  default: number | ((size: Size, blocks: Readonly<Record<string, string>>) => number)
  integer?: boolean
}

export type SlotSpec = { kind: MaterialKind; color: string }

export type BuildContext = {
  w: number
  h: number
  d: number
  block(name: string): string
  param(name: string): number
  /** Add geometry to a material slot. */
  add(slot: string, geometry: Geo): void
  /** Suggest a slot's material (e.g. metal legs); the recipe's own choice still wins. */
  suggest(slot: string, kind: MaterialKind, color?: string): void
}

export type Family = {
  id: string
  label: string
  blocks: Readonly<Record<string, BlockSpec>>
  params: Readonly<Record<string, ParamSpec>>
  slots: Readonly<Record<string, SlotSpec>>
  /** Which slot may show the product's own photo (D6: art canvas, rug top), and the plane it faces. */
  imageSlot?: string
  imageProjection?: 'xy' | 'xz'
  build(ctx: BuildContext): void
}

export function defineFamily(family: Family): Family {
  return family
}

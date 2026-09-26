/** Registry of block families and the sizes each is checked (and shown) at. */
import type { Family, Size } from '../family'
import { bed } from './bed'
import { art, curtain, mirror, pillow, planter, rug, throwBlanket, vase } from './decor'
import { diningChair } from './diningChair'
import { lamp } from './lamp'
import { chair, sofa } from './seating'
import { storage } from './storage'
import { table } from './table'

/** Authoring order follows the plan (most-used first). */
const all: Family[] = [sofa, bed, table, storage, chair, lamp, planter, rug, art, curtain, pillow, mirror, vase, diningChair, throwBlanket]

export const FAMILIES: Readonly<Record<string, Family>> = Object.fromEntries(all.map((family) => [family.id, family]))

export function getFamily(id: string): Family | undefined {
  return Object.hasOwn(FAMILIES, id) ? FAMILIES[id] : undefined
}

const size = (width: number, height: number, depth: number): Size => ({ width, height, depth })

/** Representative real-world sizes (meters): the first is typical, others stretch the proportions. */
export const FAMILY_SAMPLES: Readonly<Record<string, Size[]>> = {
  sofa: [size(2.1, 0.85, 0.95), size(2.9, 0.82, 1.7), size(1.4, 0.78, 0.85)],
  bed: [size(1.63, 1.05, 2.18), size(2.05, 1.3, 2.25), size(1.0, 0.45, 2.0)],
  table: [size(1.1, 0.42, 0.6), size(1.9, 0.76, 0.95), size(0.5, 0.56, 0.5), size(1.25, 0.8, 0.36)],
  storage: [size(1.4, 0.8, 0.46), size(0.5, 0.58, 0.4), size(0.85, 1.9, 0.34), size(1.8, 0.72, 0.45)],
  chair: [size(0.8, 0.8, 0.82), size(0.6, 0.42, 0.6), size(1.3, 0.46, 0.42)],
  lamp: [size(0.45, 1.6, 0.45), size(0.38, 0.6, 0.38), size(1.4, 1.9, 0.45)],
  planter: [size(0.6, 1.3, 0.6), size(0.35, 0.35, 0.35), size(0.25, 0.3, 0.25)],
  rug: [size(2.44, 0.012, 1.52), size(1.83, 0.012, 1.83), size(0.76, 0.01, 2.44)],
  art: [size(0.61, 0.76, 0.03), size(1.0, 0.7, 0.04), size(0.3, 0.4, 0.025)],
  curtain: [size(1.27, 2.44, 0.08), size(1.27, 2.13, 0.06), size(2.54, 2.74, 0.1)],
  pillow: [size(0.5, 0.5, 0.15), size(0.66, 0.36, 0.13), size(0.45, 0.45, 0.14)],
  mirror: [size(0.6, 1.5, 0.03), size(0.8, 0.8, 0.03), size(0.9, 1.6, 0.04)],
  vase: [size(0.18, 0.3, 0.18), size(0.3, 0.2, 0.3), size(0.1, 0.35, 0.1)],
  'dining-chair': [size(0.46, 0.82, 0.52), size(0.42, 0.66, 0.42), size(0.62, 1.0, 0.62), size(0.45, 1.0, 0.48)],
  throw: [size(0.4, 0.08, 0.3), size(0.5, 0.18, 0.18)],
}

/** Registry of hand-authored parametric assemblies, keyed by assembly id. */
import { scannedSeating } from './scannedSeating'
import type { Assembly } from '../../domain/assembly'
import { bed, dresser, nightstand } from './bedroom'
import { mirror, plant, rug, vase, wallArt } from './decor'
import { floorLamp, tableLamp } from './lighting'
import { coffeeTable, loungeChair, sofa } from './living'
import { bookshelf, desk, deskChair } from './workspace'

const all: Assembly[] = [
  ...scannedSeating,
  bed,
  nightstand,
  dresser,
  desk,
  deskChair,
  bookshelf,
  sofa,
  loungeChair,
  coffeeTable,
  floorLamp,
  tableLamp,
  rug,
  plant,
  wallArt,
  mirror,
  vase,
]

export const assemblies: Readonly<Record<string, Assembly>> = Object.fromEntries(all.map((a) => [a.id, a]))

export function getAssembly(id: string): Assembly | undefined {
  return assemblies[id]
}

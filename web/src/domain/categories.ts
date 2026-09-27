/**
 * Furniture and decor categories the app knows how to show. Typical sizes are
 * estimates for previews when nothing better is known — never presented as
 * measurements (callers mark them `estimated`).
 */

export type Mount = 'floor' | 'wall' | 'surface'

export type CategoryInfo = {
  label: string
  /** Typical size in meters (width × height × depth). */
  typical: { width: number; height: number; depth: number }
  /** Where it normally sits. Wall items hang; surface items sit on furniture. */
  mount: Mount
  /** Typical height of the object's bottom above the floor, for wall items. */
  mountHeight?: number
  /** Part of the building (a built-in closet): comes from scans only, never offered in the catalog. */
  builtIn?: boolean
}

export const CATEGORIES: Readonly<Record<string, CategoryInfo>> = {
  bed: { label: 'Bed', typical: { width: 1.6, height: 1.0, depth: 2.1 }, mount: 'floor' },
  nightstand: { label: 'Nightstand', typical: { width: 0.45, height: 0.55, depth: 0.4 }, mount: 'floor' },
  dresser: { label: 'Dresser', typical: { width: 1.0, height: 0.8, depth: 0.45 }, mount: 'floor' },
  desk: { label: 'Desk', typical: { width: 1.2, height: 0.75, depth: 0.6 }, mount: 'floor' },
  'desk-chair': { label: 'Desk chair', typical: { width: 0.5, height: 0.9, depth: 0.52 }, mount: 'floor' },
  bookshelf: { label: 'Bookshelf', typical: { width: 0.8, height: 1.8, depth: 0.32 }, mount: 'floor' },
  sofa: { label: 'Sofa', typical: { width: 2.0, height: 0.85, depth: 0.9 }, mount: 'floor' },
  'lounge-chair': { label: 'Lounge chair', typical: { width: 0.75, height: 0.8, depth: 0.8 }, mount: 'floor' },
  'coffee-table': { label: 'Coffee table', typical: { width: 1.0, height: 0.42, depth: 0.55 }, mount: 'floor' },
  'floor-lamp': { label: 'Floor lamp', typical: { width: 0.4, height: 1.6, depth: 0.4 }, mount: 'floor' },
  'table-lamp': { label: 'Table lamp', typical: { width: 0.3, height: 0.5, depth: 0.3 }, mount: 'surface' },
  rug: { label: 'Rug', typical: { width: 2.0, height: 0.01, depth: 1.4 }, mount: 'floor' },
  plant: { label: 'Plant', typical: { width: 0.5, height: 1.2, depth: 0.5 }, mount: 'floor' },
  'wall-art': { label: 'Wall art', typical: { width: 0.9, height: 0.75, depth: 0.04 }, mount: 'wall', mountHeight: 1.2 },
  // Floor mirrors: they stand on the floor, leaning against a wall.
  mirror: { label: 'Mirror', typical: { width: 0.5, height: 1.5, depth: 0.03 }, mount: 'wall', mountHeight: 0 },
  // Built-in closets: RoomPlan sees only their doors (a tall `storage` with no depth). Shown as doors set on the wall.
  closet: { label: 'Closet', typical: { width: 1.2, height: 2.1, depth: 0.04 }, mount: 'wall', mountHeight: 0, builtIn: true },
  vase: { label: 'Vase', typical: { width: 0.18, height: 0.3, depth: 0.18 }, mount: 'surface' },
  // Real-catalog categories. Every category is drawn from blocks (src/blocks/registry.ts).
  sectional: { label: 'Sectional', typical: { width: 2.8, height: 0.85, depth: 1.7 }, mount: 'floor' },
  'dining-chair': { label: 'Dining chair', typical: { width: 0.46, height: 0.85, depth: 0.52 }, mount: 'floor' },
  ottoman: { label: 'Ottoman', typical: { width: 0.6, height: 0.42, depth: 0.6 }, mount: 'floor' },
  bench: { label: 'Bench', typical: { width: 1.2, height: 0.45, depth: 0.4 }, mount: 'floor' },
  'side-table': { label: 'Side table', typical: { width: 0.5, height: 0.55, depth: 0.5 }, mount: 'floor' },
  'dining-table': { label: 'Dining table', typical: { width: 1.8, height: 0.75, depth: 0.9 }, mount: 'floor' },
  console: { label: 'Console', typical: { width: 1.2, height: 0.8, depth: 0.38 }, mount: 'floor' },
  cabinet: { label: 'Cabinet', typical: { width: 1.5, height: 0.75, depth: 0.45 }, mount: 'floor' },
  // Floor-length panels hang from a rod; the bottom sits just above the floor.
  curtain: { label: 'Curtain', typical: { width: 1.27, height: 2.13, depth: 0.05 }, mount: 'wall', mountHeight: 0.02 },
  pillow: { label: 'Pillow', typical: { width: 0.5, height: 0.5, depth: 0.15 }, mount: 'surface' },
  throw: { label: 'Throw', typical: { width: 0.4, height: 0.08, depth: 0.3 }, mount: 'surface' },
  planter: { label: 'Planter', typical: { width: 0.35, height: 0.35, depth: 0.35 }, mount: 'floor' },
  'decor-object': { label: 'Decor', typical: { width: 0.15, height: 0.2, depth: 0.15 }, mount: 'surface' },
}

/** Captured (RoomPlan) categories and the catalog categories that can stand in for them. */
const STAND_INS: Readonly<Record<string, string[]>> = {
  table: ['desk', 'coffee-table', 'dining-table', 'side-table', 'console'],
  chair: ['desk-chair', 'lounge-chair', 'dining-chair'],
  storage: ['dresser', 'nightstand', 'bookshelf', 'cabinet'],
}

/** Chair searches include the catalog's distinct chair roles. */
export const CHAIR_CATEGORIES = ['desk-chair', 'lounge-chair', 'dining-chair'] as const

/** Catalog categories offered as alternatives for an object of this category. */
export function alternativeCategories(category: string): string[] {
  if (category === 'chair' || CHAIR_CATEGORIES.some((chair) => chair === category)) return [...CHAIR_CATEGORIES]
  const standIns = STAND_INS[category]
  if (standIns) return standIns
  return CATEGORIES[category] ? [category] : []
}

export function categoryInfo(category: string): CategoryInfo | undefined {
  return Object.hasOwn(CATEGORIES, category) ? CATEGORIES[category] : undefined
}

/** Hung on a wall above the floor (art): it can't be turned or dragged across the floor. */
export function isWallHung(object: { category: string; pose: { position: { y: number } } }): boolean {
  return categoryInfo(object.category)?.mount === 'wall' && object.pose.position.y > 1e-6
}

/**
 * Mounted on or against a wall (art, floor mirrors, built-in closets), at any height. Such an item goes with its
 * wall when the wall is cut away for the dollhouse view. Unlike `isWallHung`, says nothing about dragging.
 */
export function isWallMounted(object: { category: string }): boolean {
  return categoryInfo(object.category)?.mount === 'wall'
}

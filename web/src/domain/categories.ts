/**
 * Furniture and decor categories the app knows how to show. Typical sizes are
 * estimates for previews when nothing better is known — never presented as
 * measurements (callers mark them `estimated`).
 */

export type Mount = 'floor' | 'wall' | 'surface'

export type CategoryInfo = {
  label: string
  /** Parametric template used when no product-specific asset exists. */
  assemblyId: string | null
  /** Typical size in meters (width × height × depth). */
  typical: { width: number; height: number; depth: number }
  /** Where it normally sits. Wall items hang; surface items sit on furniture. */
  mount: Mount
  /** Typical height of the object's bottom above the floor, for wall items. */
  mountHeight?: number
}

export const CATEGORIES: Readonly<Record<string, CategoryInfo>> = {
  bed: { label: 'Bed', assemblyId: 'bed', typical: { width: 1.6, height: 1.0, depth: 2.1 }, mount: 'floor' },
  nightstand: { label: 'Nightstand', assemblyId: 'nightstand', typical: { width: 0.45, height: 0.55, depth: 0.4 }, mount: 'floor' },
  dresser: { label: 'Dresser', assemblyId: 'dresser', typical: { width: 1.0, height: 0.8, depth: 0.45 }, mount: 'floor' },
  desk: { label: 'Desk', assemblyId: 'desk', typical: { width: 1.2, height: 0.75, depth: 0.6 }, mount: 'floor' },
  'desk-chair': { label: 'Desk chair', assemblyId: 'desk-chair', typical: { width: 0.5, height: 0.9, depth: 0.52 }, mount: 'floor' },
  bookshelf: { label: 'Bookshelf', assemblyId: 'bookshelf', typical: { width: 0.8, height: 1.8, depth: 0.32 }, mount: 'floor' },
  sofa: { label: 'Sofa', assemblyId: 'sofa', typical: { width: 2.0, height: 0.85, depth: 0.9 }, mount: 'floor' },
  'lounge-chair': { label: 'Lounge chair', assemblyId: 'lounge-chair', typical: { width: 0.75, height: 0.8, depth: 0.8 }, mount: 'floor' },
  'coffee-table': { label: 'Coffee table', assemblyId: 'coffee-table', typical: { width: 1.0, height: 0.42, depth: 0.55 }, mount: 'floor' },
  'floor-lamp': { label: 'Floor lamp', assemblyId: 'floor-lamp', typical: { width: 0.4, height: 1.6, depth: 0.4 }, mount: 'floor' },
  'table-lamp': { label: 'Table lamp', assemblyId: 'table-lamp', typical: { width: 0.3, height: 0.5, depth: 0.3 }, mount: 'surface' },
  rug: { label: 'Rug', assemblyId: 'rug', typical: { width: 2.0, height: 0.01, depth: 1.4 }, mount: 'floor' },
  plant: { label: 'Plant', assemblyId: 'plant', typical: { width: 0.5, height: 1.2, depth: 0.5 }, mount: 'floor' },
  'wall-art': { label: 'Wall art', assemblyId: 'wall-art', typical: { width: 0.6, height: 0.8, depth: 0.04 }, mount: 'wall', mountHeight: 1.2 },
  mirror: { label: 'Mirror', assemblyId: 'mirror', typical: { width: 0.5, height: 1.5, depth: 0.03 }, mount: 'wall', mountHeight: 0.4 },
  vase: { label: 'Vase', assemblyId: 'vase', typical: { width: 0.18, height: 0.3, depth: 0.18 }, mount: 'surface' },
}

export function categoryInfo(category: string): CategoryInfo | undefined {
  return CATEGORIES[category]
}

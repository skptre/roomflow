/**
 * Which harvested products go into the committed snapshot. Some stores list
 * every fabric of one design as its own product (Maiden Home: ~2,600), so we
 * keep at most `perGroup` products per (store, category) and take one of each
 * design in turn before a second of any. Distinct products are never merged.
 */

type Selectable = { id: string; name: string; storeDomain: string; category: string }

/** "The Brasa Sofa - Performance Velvet Taupe" → "the brasa sofa". */
export function designName(name: string): string {
  return name
    .split(/ [-|–—] /)[0]!
    .replace(/\s+\d+(?:\.\d+)?"\s*$/, '')
    .trim()
    .toLowerCase()
}

export function selectForSnapshot<T extends Selectable>(products: readonly T[], perGroup: number): T[] {
  const groups = new Map<string, Map<string, T[]>>()
  for (const product of products) {
    const key = `${product.storeDomain}|${product.category}`
    const designs = groups.get(key) ?? new Map<string, T[]>()
    groups.set(key, designs)
    const design = designName(product.name)
    const list = designs.get(design) ?? []
    designs.set(design, list)
    list.push(product)
  }
  const kept: T[] = []
  for (const designs of groups.values()) {
    const queues = [...designs.values()].map((list) => [...list])
    let taken = 0
    while (taken < perGroup && queues.some((queue) => queue.length > 0)) {
      for (const queue of queues) {
        if (taken >= perGroup) break
        const next = queue.shift()
        if (!next) continue
        kept.push(next)
        taken += 1
      }
    }
  }
  return kept
}

import type { CatalogQuery, CatalogResult, CatalogSource } from '../domain/catalog'
import { sampleCatalog } from './sample-catalog'

/**
 * Catalog source backed by the bundled SAMPLE catalog. Live search implements
 * the same interface later; results are always marked `source: 'sample'`.
 * Retrieval only — ranking and pruning happen in the caller's pipeline.
 */
export class SampleCatalogSource implements CatalogSource {
  async query(query: CatalogQuery): Promise<CatalogResult> {
    const categories = query.category
    const entries = categories ? sampleCatalog.filter((entry) => categories.includes(entry.product.category)) : sampleCatalog.slice()
    return { baseRevision: query.baseRevision, entries, source: 'sample' }
  }
}

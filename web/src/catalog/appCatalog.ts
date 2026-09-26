/**
 * The app's catalog: the committed snapshot of real store listings, fetched
 * from public/catalog on first use.
 */
import { createCatalogStore, SnapshotCatalogSource } from './snapshotCatalog'

export const catalogStore = createCatalogStore(async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}catalog/snapshot.json`)
  if (!response.ok) throw new Error(`catalog HTTP ${response.status}`)
  return response.json()
})

export const catalogSource = new SnapshotCatalogSource(catalogStore)

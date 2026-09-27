/**
 * The app's catalog: the committed snapshot of real store listings, fetched
 * from public/catalog on first use.
 */
import { createCatalogStore, SnapshotCatalogSource } from './snapshotCatalog'

async function catalogFile(name: string): Promise<unknown> {
  const response = await fetch(`${import.meta.env.BASE_URL}catalog/${name}`)
  if (!response.ok) throw new Error(`catalog ${name}: HTTP ${response.status}`)
  return response.json()
}

export const catalogStore = createCatalogStore(
  () => catalogFile('snapshot.json'),
  // Each product's block recipe (scripts/recipes.ts); without it listings use their category's default look.
  () => catalogFile('recipes.json'),
)

export const catalogSource = new SnapshotCatalogSource(catalogStore)

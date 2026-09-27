import { useGLTF } from '@react-three/drei'
import { modelFor } from '../blocks/build'
import { recipeForAsset } from '../blocks/registry'
import type { CatalogEntry } from '../domain/catalog'

/**
 * Start preparing the visual assets of a few likely picks so hovering them is
 * instant. GLB models are fetched and parsed ahead of time; block models are
 * built into the shared model cache when the browser is idle.
 */
export function prepareAssets(entries: readonly CatalogEntry[]) {
  for (const { product, variant } of entries) {
    const asset = variant.asset
    if (asset.kind === 'glb') useGLTF.preload(asset.url)
    if (asset.kind === 'recipe') {
      const recipe = recipeForAsset(asset, product.category)
      if (recipe) whenIdle(() => modelFor(recipe, variant.dimensions))
    }
  }
}

function whenIdle(task: () => void) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => task(), { timeout: 2000 })
  else setTimeout(task, 50)
}

import { useGLTF } from '@react-three/drei'
import type { CatalogEntry } from '../domain/catalog'

/**
 * Start preparing the visual assets of a few likely picks so hovering them is
 * instant. GLB models are fetched and parsed ahead of time; parametric
 * assemblies are built on first render from cached part geometry and need nothing.
 */
export function prepareAssets(entries: readonly CatalogEntry[]) {
  for (const { variant } of entries) {
    if (variant.asset.kind === 'glb') useGLTF.preload(variant.asset.url)
  }
}

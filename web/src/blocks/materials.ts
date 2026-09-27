/**
 * Flat block materials (no textures, plan D6): one preset per material kind,
 * one shared instance per (kind, color). Colors are sRGB hex strings; three's
 * color management converts them to linear once, so what the store calls
 * "#4a4b4d" is what the renderer means.
 */
import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three'
import type { MaterialKind } from './family'

const cache = new Map<string, Material>()

function create(kind: MaterialKind, color: string): Material {
  switch (kind) {
    case 'fabric':
      // Sheen in the fabric's own color: a white sheen washes dark fabrics (navy, charcoal) out to grey.
      return new MeshPhysicalMaterial({ color, roughness: 0.92, sheen: 0.3, sheenRoughness: 0.8, sheenColor: color })
    case 'leather':
      return new MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.12, clearcoatRoughness: 0.5 })
    case 'wood':
      return new MeshStandardMaterial({ color, roughness: 0.6 })
    case 'metal':
      return new MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.9 })
    case 'ceramic':
      return new MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.3 })
    case 'glass':
      return new MeshPhysicalMaterial({ color, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false })
    case 'stone':
      return new MeshStandardMaterial({ color, roughness: 0.7 })
    case 'plant':
      return new MeshStandardMaterial({ color, roughness: 0.8 })
    case 'paper':
      // Lamp shades are thin shells seen from inside too.
      return new MeshStandardMaterial({ color, roughness: 0.9, side: DoubleSide })
    case 'mirror':
      // The scene keeps reflections subtle (environmentIntensity 0.35); a mirror needs them bright to read as silver, not dark glass.
      return new MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.9, envMapIntensity: 2.6 })
  }
}

/** Shared material for a kind and sRGB hex color. Released by disposeBlockMaterials. */
export function blockMaterial(kind: MaterialKind, color: string): Material {
  const key = `${kind}|${color.toLowerCase()}`
  let material = cache.get(key)
  if (!material) {
    material = create(kind, color)
    cache.set(key, material)
  }
  return material
}

/** Whether a kind should cast shadows (see-through glass does not). */
export function castsShadow(kind: MaterialKind): boolean {
  return kind !== 'glass'
}

export function disposeBlockMaterials() {
  for (const material of cache.values()) material.dispose()
  cache.clear()
}

/** Small catalog stills rendered from the same block models as the room. */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  ACESFilmicToneMapping,
} from 'three'
import { acquireModel, slotLooks } from '../blocks/build'
import { resolveRecipe } from '../blocks/registry'
import type { AssetRef, Dimensions } from '../domain/schema'

const cache = new Map<string, string>()
let renderer: WebGLRenderer | null = null
let release: ReturnType<typeof setTimeout> | undefined

export function thumbnail(asset: AssetRef, dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'>, category: string): string | null {
  if (asset.kind !== 'recipe') return null
  const recipe = resolveRecipe(asset.recipeId, category)
  if (!recipe) return null
  const size = { width: dimensions.width, height: dimensions.height, depth: dimensions.depth }
  const key = JSON.stringify([asset, size, recipe.id])
  const cached = cache.get(key)
  if (cached) return cached
  const materials: MeshStandardMaterial[] = []
  let held: ReturnType<typeof acquireModel> | null = null
  try {
    if (!renderer) {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
      renderer.setSize(420, 300)
      renderer.setClearColor(0x000000, 0)
      renderer.toneMapping = ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.25
    }
    held = acquireModel(recipe, size)
    const scene = new Scene()
    const group = new Group()
    for (const look of slotLooks(recipe, held.model, asset.colors)) {
      const material = new MeshStandardMaterial({
        color: new Color(look.color),
        roughness: look.kind === 'metal' || look.kind === 'mirror' ? 0.45 : 0.8,
        metalness: look.kind === 'metal' || look.kind === 'mirror' ? 0.25 : 0,
      })
      materials.push(material)
      group.add(new Mesh(look.geometry, material))
    }
    scene.add(group, new AmbientLight('#fff8ed', 2))
    const light = new DirectionalLight('#ffffff', 3)
    light.position.set(-3, 6, 5)
    scene.add(light)
    const bounds = new Box3().setFromObject(group)
    const center = bounds.getCenter(new Vector3())
    const radius = bounds.getSize(new Vector3()).length() / 2
    const camera = new OrthographicCamera(-radius * 1.4, radius * 1.4, radius, -radius, 0.01, 100)
    camera.position.copy(center).add(new Vector3(3, 2.3, 4).normalize().multiplyScalar(radius * 5))
    camera.lookAt(center)
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL('image/png')
    if (cache.size > 100) cache.delete(cache.keys().next().value!)
    cache.set(key, url)
    return url
  } catch {
    return null
  } finally {
    materials.forEach((material) => material.dispose())
    held?.release()
    clearTimeout(release)
    release = setTimeout(() => {
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = null
    }, 1000)
  }
}

/** Small catalog stills rendered from the same authored geometry as the room. */
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
import type { AssetRef, Dimensions } from '../domain/schema'
import { getAssembly } from '../fixtures/assemblies'
import { bevelRadius, partGeometry } from './partGeometry'

const cache = new Map<string, string>()
let renderer: WebGLRenderer | null = null
let release: ReturnType<typeof setTimeout> | undefined

export function thumbnail(asset: AssetRef, dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'>): string | null {
  if (asset.kind !== 'parametric') return null
  const assembly = getAssembly(asset.assemblyId)
  if (!assembly) return null
  const key = JSON.stringify([asset, dimensions])
  const cached = cache.get(key)
  if (cached) return cached
  const materials: MeshStandardMaterial[] = []
  try {
    if (!renderer) {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
      renderer.setSize(420, 300)
      renderer.setClearColor(0x000000, 0)
      renderer.toneMapping = ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.25
    }
    const scene = new Scene()
    const group = new Group()
    const scale = [dimensions.width, dimensions.height, dimensions.depth]
    for (const part of assembly.parts) {
      const size = part.size.map((v, i) => v * scale[i]!) as [number, number, number]
      const color = asset.recolor?.[part.color.toLowerCase()] ?? part.color
      const material = new MeshStandardMaterial({
        color: new Color(color),
        roughness: 0.8,
        metalness: part.material === 'metal' ? 0.25 : 0,
      })
      materials.push(material)
      const mesh = new Mesh(
        partGeometry(part.shape, size, part.shape === 'box' ? bevelRadius(part.material, size) : 0),
        material,
      )
      mesh.position.set(...(part.position.map((v, i) => v * scale[i]!) as [number, number, number]))
      mesh.rotation.set(...(part.rotation ?? [0, 0, 0]))
      group.add(mesh)
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
    clearTimeout(release)
    release = setTimeout(() => {
      renderer?.dispose()
      renderer?.forceContextLoss()
      renderer = null
    }, 1000)
  }
}

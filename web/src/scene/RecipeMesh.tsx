import { useTexture } from '@react-three/drei'
import { Component, memo, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { MeshStandardMaterial, SRGBColorSpace, type Texture } from 'three'
import { acquireModel, imageAspect, modelFor, slotLooks, type SlotLook } from '../blocks/build'
import { getFamily } from '../blocks/families'
import { blockMaterial, castsShadow } from '../blocks/materials'
import type { Recipe } from '../blocks/recipe'
import type { Dimensions } from '../domain/schema'
import { sizedImage } from '../catalog/display'

type RecipeMeshProps = {
  recipe: Recipe
  dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'>
  /** Variant colors per slot (sRGB hex). */
  colors?: Readonly<Record<string, string>>
  /** Applied only to intentionally placed lamps, not fixtures merely seen in a scan. */
  illuminated?: boolean
}

/**
 * Draws a recipe at the object's authoritative size: one mesh per material
 * slot, sharing geometry with every other object of the same shape and size,
 * and sharing materials by (kind, color). Art canvases and rug tops show the
 * product's own photo when it loads, flat color otherwise (plan D6).
 */
export const RecipeMesh = memo(function RecipeMesh({ recipe, dimensions, colors, illuminated = false }: RecipeMeshProps) {
  const { width, height, depth } = dimensions
  const model = useMemo(() => modelFor(recipe, { width, height, depth }), [recipe, width, height, depth])
  // Hold the shared model while mounted so the cache won't free it underneath us.
  useEffect(() => acquireModel(recipe, { width, height, depth }).release, [recipe, width, height, depth])

  const looks = useMemo(() => slotLooks(recipe, model, colors), [recipe, model, colors])
  const imageSlot = recipe.image ? getFamily(recipe.family)?.imageSlot : undefined

  return (
    <group>
      {looks.map((look) =>
        look.slot === imageSlot && recipe.image ? (
          <ImageErrorBoundary key={look.slot} fallback={<SlotMesh look={look} />}>
            <Suspense fallback={<SlotMesh look={look} />}>
              <PhotoSlot look={look} url={sizedImage(recipe.image.url, 1024)} aspect={imageAspect(recipe, model)} />
            </Suspense>
          </ImageErrorBoundary>
        ) : (
          <SlotMesh key={look.slot} look={look} lampShade={illuminated && recipe.family === 'lamp' && look.slot === 'shade'} />
        ),
      )}
    </group>
  )
})

function SlotMesh({ look, lampShade = false }: { look: SlotLook; lampShade?: boolean }) {
  const glowMaterial = useMemo(() => {
    if (!lampShade) return null
    const base = blockMaterial(look.kind, look.color)
    if (!(base instanceof MeshStandardMaterial)) return null
    const material = base.clone()
    material.emissive.set('#ffddb1')
    material.emissiveIntensity = 0.09
    return material
  }, [lampShade, look.kind, look.color])
  useEffect(() => () => glowMaterial?.dispose(), [glowMaterial])
  return (
    <mesh
      geometry={look.geometry}
      material={glowMaterial ?? blockMaterial(look.kind, look.color)}
      castShadow={castsShadow(look.kind)}
      receiveShadow
      // Geometry and materials are shared caches; never auto-dispose them here.
      dispose={null}
    />
  )
}

/** The slot with the product photo, cropped to cover the face without stretching. */
function PhotoSlot({ look, url, aspect }: { look: SlotLook; url: string; aspect: number | null }) {
  const source = useTexture(url)
  const material = useMemo(() => {
    const texture: Texture = source.clone()
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
    const image = source.image as { width?: number; height?: number } | undefined
    const photoAspect = image?.width && image.height ? image.width / image.height : null
    if (aspect && photoAspect) {
      // Cover: scale down the longer side of the photo and center it.
      if (photoAspect > aspect) {
        texture.repeat.set(aspect / photoAspect, 1)
        texture.offset.set((1 - aspect / photoAspect) / 2, 0)
      } else {
        texture.repeat.set(1, photoAspect / aspect)
        texture.offset.set(0, (1 - photoAspect / aspect) / 2)
      }
    }
    texture.needsUpdate = true
    return new MeshStandardMaterial({ map: texture, roughness: look.kind === 'paper' ? 0.85 : 0.95 })
  }, [source, aspect, look.kind])
  useEffect(
    () => () => {
      material.map?.dispose()
      material.dispose()
    },
    [material],
  )
  return <mesh geometry={look.geometry} material={material} castShadow receiveShadow dispose={null} />
}

class ImageErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

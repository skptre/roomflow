import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { SRGBColorSpace, TextureLoader, type Texture } from 'three'
import { useStore } from 'zustand'
import type { Dimensions } from '../domain/schema'
import { evidenceStore } from '../ui/evidenceStore'

/** The photo sits this far in front of the art's front face so it never z-fights with the assembly. */
const FACE_OFFSET = 0.001
/** Fraction of the front the photo covers; the rest shows the frame's edge. */
const COVER = 0.98

/**
 * The phone's straight-on photo of a piece of wall art, drawn on its front face (local +Z, origin at the
 * bottom-center). Renders nothing when the package shared no photo for it. The texture and its object URL are
 * released when the photo changes or the object unmounts.
 */
export function ArtPhoto({ objectId, dimensions }: { objectId: string; dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'> }) {
  const blob = useStore(evidenceStore, (state) => state.artPhotoFor(objectId))
  const invalidate = useThree((state) => state.invalidate)
  const [texture, setTexture] = useState<Texture | null>(null)

  useEffect(() => {
    if (!blob) return
    let cancelled = false
    let loaded: Texture | null = null
    const url = URL.createObjectURL(blob)
    new TextureLoader().load(
      url,
      (next) => {
        URL.revokeObjectURL(url)
        if (cancelled) {
          next.dispose()
          return
        }
        next.colorSpace = SRGBColorSpace
        loaded = next
        setTexture(next)
        invalidate()
      },
      undefined,
      // A photo that can't be decoded leaves the default artwork showing.
      () => URL.revokeObjectURL(url),
    )
    return () => {
      cancelled = true
      URL.revokeObjectURL(url)
      loaded?.dispose()
      setTexture(null)
    }
  }, [blob, invalidate])

  if (!blob || !texture) return null
  const { width, height, depth } = dimensions
  return (
    <mesh position={[0, height / 2, depth / 2 + FACE_OFFSET]} receiveShadow>
      <planeGeometry args={[width * COVER, height * COVER]} />
      <meshStandardMaterial map={texture} roughness={0.85} metalness={0} />
    </mesh>
  )
}

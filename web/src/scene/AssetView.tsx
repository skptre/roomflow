import { Edges, Html, useGLTF } from '@react-three/drei'
import { Component, Suspense, useMemo, type ReactNode } from 'react'
import { Box3, Vector3 } from 'three'
import { recipeForAsset } from '../blocks/registry'
import type { AssetRef, Dimensions } from '../domain/schema'
import { palette } from './palette'
import { RecipeMesh } from './RecipeMesh'

type Size = Pick<Dimensions, 'width' | 'height' | 'depth'>

type AssetViewProps = {
  asset: AssetRef
  dimensions: Size
  /** The object's category: its default recipe draws it when the asset's own recipe isn't known. */
  category: string
}

/**
 * Draws an object's visual asset at its authoritative size, origin at the
 * bottom-center: a block recipe, a GLB model, or a placeholder box. An
 * unknown recipe falls back to the category's default, and anything we can't
 * draw to a placeholder, so the object always stays visible and selectable.
 */
export function AssetView({ asset, dimensions, category }: AssetViewProps) {
  switch (asset.kind) {
    case 'recipe': {
      const recipe = recipeForAsset(asset, category)
      return recipe ? (
        <AssetErrorBoundary fallback={<Placeholder dimensions={dimensions} label="Model unavailable" />}>
          <RecipeMesh recipe={recipe} dimensions={dimensions} colors={asset.colors} />
        </AssetErrorBoundary>
      ) : <Placeholder dimensions={dimensions} />
    }
    case 'glb':
      return (
        // Keyed by URL so a different model gets a fresh attempt after an earlier failure.
        <AssetErrorBoundary key={asset.url} fallback={<Placeholder dimensions={dimensions} label="Model unavailable" />}>
          <Suspense fallback={<Placeholder dimensions={dimensions} label="Preparing model" />}>
            <GlbModel url={asset.url} dimensions={dimensions} />
          </Suspense>
        </AssetErrorBoundary>
      )
    case 'placeholder':
      return <Placeholder dimensions={dimensions} />
  }
}

/** Restrained, translucent size box. The label only appears while something is actually happening. */
export function Placeholder({ dimensions, label }: { dimensions: Size; label?: string }) {
  return (
    <group>
      <mesh position-y={dimensions.height / 2}>
        <boxGeometry args={[dimensions.width, dimensions.height, dimensions.depth]} />
        <meshStandardMaterial color={palette.placeholder} transparent opacity={0.35} depthWrite={false} />
        <Edges color={palette.placeholder} />
      </mesh>
      {label ? (
        <Html position={[0, dimensions.height + 0.12, 0]} center zIndexRange={[20, 0]}>
          <span className="pointer-events-none whitespace-nowrap rounded-pill bg-surface/90 px-2 py-0.5 text-xs font-medium text-muted shadow-panel">
            {label}
          </span>
        </Html>
      ) : null}
    </group>
  )
}

/** A GLB scaled per axis to the authoritative dimensions and moved so its base sits at the origin. */
function GlbModel({ url, dimensions }: { url: string; dimensions: Size }) {
  const { scene } = useGLTF(url)
  const { model, scale, offset } = useMemo(() => {
    const model = scene.clone(true)
    model.traverse((node) => {
      if ('isMesh' in node && node.isMesh) {
        node.castShadow = true
        node.receiveShadow = true
      }
    })
    const bounds = new Box3().setFromObject(model)
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const scale: [number, number, number] = [
      dimensions.width / (size.x || 1),
      dimensions.height / (size.y || 1),
      dimensions.depth / (size.z || 1),
    ]
    const offset: [number, number, number] = [-center.x, -bounds.min.y, -center.z]
    return { model, scale, offset }
  }, [scene, dimensions.width, dimensions.height, dimensions.depth])

  return (
    <group scale={scale}>
      <primitive object={model} position={offset} />
    </group>
  )
}

class AssetErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

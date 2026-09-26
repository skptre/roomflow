import { memo } from 'react'
import type { Assembly } from '../domain/assembly'
import type { Dimensions } from '../domain/schema'
import { partMaterial } from './materials'
import { partMesh } from './partGeometry'

type AssemblyMeshProps = {
  assembly: Assembly
  dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'>
  /** Swap authored colors for a variant or a photographed item's tint: { '#from': '#to' }. */
  recolor?: Readonly<Record<string, string>>
}

/**
 * Renders a parametric assembly at the object's authoritative size. Each part's
 * normalized size and position are scaled by the object's width/height/depth
 * (see partMesh: rotated parts rotate in the unit box before scaling, exactly as
 * validated), with real-size geometry so bevels and texture scale stay true.
 */
export const AssemblyMesh = memo(function AssemblyMesh({ assembly, dimensions, recolor }: AssemblyMeshProps) {
  return (
    <group>
      {assembly.parts.map((part) => {
        const { geometry, position, rotation } = partMesh(part, dimensions)
        const color = recolor?.[part.color.toLowerCase()] ?? part.color
        return (
          <mesh
            key={part.name}
            geometry={geometry}
            material={partMaterial(part.material, color, part.texture)}
            position={position}
            rotation={rotation}
            castShadow={part.material !== 'glass'}
            receiveShadow
            // Geometry and material are shared caches, released by RoomScene; never auto-dispose them here.
            dispose={null}
          />
        )
      })}
    </group>
  )
})

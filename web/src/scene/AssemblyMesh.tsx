import { memo } from 'react'
import type { Assembly } from '../domain/assembly'
import type { Dimensions } from '../domain/schema'
import { partMaterial } from './materials'
import { bevelRadius, partGeometry } from './partGeometry'

type AssemblyMeshProps = {
  assembly: Assembly
  dimensions: Pick<Dimensions, 'width' | 'height' | 'depth'>
  /** Swap authored colors for a variant or a photographed item's tint: { '#from': '#to' }. */
  recolor?: Readonly<Record<string, string>>
}

/**
 * Renders a parametric assembly at the object's authoritative size. Each part's
 * normalized size and position are scaled by the object's width/height/depth;
 * geometry is built at that real size so bevels and texture scale stay true.
 */
export const AssemblyMesh = memo(function AssemblyMesh({ assembly, dimensions, recolor }: AssemblyMeshProps) {
  const scale = [dimensions.width, dimensions.height, dimensions.depth] as const
  return (
    <group>
      {assembly.parts.map((part) => {
        const size = [part.size[0] * scale[0], part.size[1] * scale[1], part.size[2] * scale[2]] as const
        const color = recolor?.[part.color.toLowerCase()] ?? part.color
        return (
          <mesh
            key={part.name}
            geometry={partGeometry(part.shape, size, part.shape === 'box' ? bevelRadius(part.material, size) : 0)}
            material={partMaterial(part.material, color, part.texture)}
            position={[part.position[0] * scale[0], part.position[1] * scale[1], part.position[2] * scale[2]]}
            rotation={part.rotation ?? [0, 0, 0]}
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

import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, EdgesGeometry, LineDashedMaterial, Mesh, type Group, type LineSegments, type Material } from 'three'
import type { PurchaseSources } from '../domain/designStore'
import type { RoomObject } from '../domain/schema'
import { FurnitureObject } from './FurnitureObject'

/** Landing-only bed loop: a solid piece becomes a dashed spatial outline, then returns. */
export function HeroBed({ object, sources, reducedMotion }: { object: RoomObject; sources: PurchaseSources; reducedMotion: boolean }) {
  const solid = useRef<Group>(null)
  const ghost = useRef<Group>(null)
  const lines = useRef<LineSegments[]>([])
  const ghostMaterials = useRef<LineDashedMaterial[]>([])
  const solidMaterials = useRef<Material[]>([])
  const { width, height, depth } = object.dimensions
  const outlines = useMemo(() => {
    const boxes = [
      { size: [width, Math.min(0.42, height * 0.5), depth] as const, position: [0, Math.min(0.42, height * 0.5) / 2, 0] as const },
      { size: [width * 0.95, 0.2, depth * 0.78] as const, position: [0, Math.min(0.42, height * 0.5) + 0.1, depth * 0.07] as const },
      { size: [width, Math.max(0.35, height * 0.75), 0.12] as const, position: [0, Math.max(0.35, height * 0.75) / 2, -depth / 2 + 0.06] as const },
    ]
    return boxes.map(({ size, position }) => {
      const box = new BoxGeometry(...size)
      const geometry = new EdgesGeometry(box)
      box.dispose()
      return { geometry, position }
    })
  }, [width, height, depth])

  useLayoutEffect(() => {
    const group = solid.current
    if (!group) return
    const originals: Array<{ mesh: Mesh; material: Material | Material[]; castShadow: boolean }> = []
    const clones = new Map<Material, Material>()
    group.traverse((node) => {
      if (!(node instanceof Mesh)) return
      const copy = (source: Material) => {
        let clone = clones.get(source)
        if (!clone) {
          clone = source.clone()
          clone.transparent = true
          clone.depthWrite = false
          clones.set(source, clone)
        }
        return clone
      }
      originals.push({ mesh: node, material: node.material, castShadow: node.castShadow })
      node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material)
      // Transparent materials do not fade their shadow maps with opacity.
      node.castShadow = false
    })
    solidMaterials.current = [...clones.values()]
    return () => {
      originals.forEach(({ mesh, material: original, castShadow }) => {
        mesh.material = original
        mesh.castShadow = castShadow
      })
      clones.forEach((clone) => clone.dispose())
      solidMaterials.current = []
    }
  }, [])

  useEffect(() => {
    lines.current.forEach((line) => line.computeLineDistances())
    const materials = ghostMaterials.current.slice()
    return () => {
      outlines.forEach(({ geometry }) => geometry.dispose())
      materials.forEach((entry) => entry.dispose())
    }
  }, [outlines])

  useFrame(({ clock }) => {
    if (reducedMotion || !solid.current || !ghost.current) return
    const time = clock.elapsedTime % 6
    const ease = (value: number) => value * value * (3 - 2 * value)
    const solidOpacity = time < 2
      ? 1
      : time < 2.85
        ? 1 - ease((time - 2) / 0.85)
        : time < 4.1
          ? 0
          : time < 5
            ? ease((time - 4.1) / 0.9)
            : 1
    const ghostOpacity = 1 - solidOpacity
    solid.current.visible = solidOpacity > 0.01
    ghost.current.visible = ghostOpacity > 0.01
    solidMaterials.current.forEach((entry) => { entry.opacity = solidOpacity })
    ghostMaterials.current.forEach((entry) => { entry.opacity = ghostOpacity })
    solid.current.position.y = 0.22 * ghostOpacity
  })

  return (
    <>
      <group ref={solid}>
        <FurnitureObject object={object} editable={false} selected={false} hidden={false} hovered={false} sources={sources} reducedMotion={reducedMotion} onHover={() => undefined} onSelect={() => undefined} />
      </group>
      <group ref={ghost} visible={false} position={[object.pose.position.x, object.pose.position.y, object.pose.position.z]} rotation-y={object.pose.yaw}>
        {outlines.map(({ geometry, position }, index) => (
          <lineSegments key={index} ref={(line) => { if (line) lines.current[index] = line }} geometry={geometry} position={[...position]} dispose={null}>
            <lineDashedMaterial ref={(entry) => { if (entry) ghostMaterials.current[index] = entry }} color="#79503e" dashSize={0.055} gapSize={0.04} transparent opacity={0} depthWrite={false} />
          </lineSegments>
        ))}
      </group>
    </>
  )
}

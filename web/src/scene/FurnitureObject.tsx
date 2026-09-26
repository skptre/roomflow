import { Select } from '@react-three/postprocessing'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useRef } from 'react'
import type { Group } from 'three'
import type { PurchaseSources } from '../domain/designStore'
import type { RoomObject } from '../domain/schema'
import { AssetView } from './AssetView'
import { HoverTag } from './HoverTag'

/** How far a selected object rises, as a subtle "picked up" cue (meters). */
const LIFT = 0.015
/** Pointer travel (px) above which a press is an orbit drag, not a click. */
const CLICK_SLOP = 4

type FurnitureObjectProps = {
  object: RoomObject
  selected: boolean
  hovered: boolean
  sources: PurchaseSources
  reducedMotion: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

/** One placed object: pose (bottom-center + yaw) around its visual asset, with hover and selection. */
export const FurnitureObject = memo(function FurnitureObject({
  object,
  selected,
  hovered,
  sources,
  reducedMotion,
  onHover,
  onSelect,
}: FurnitureObjectProps) {
  const { position, yaw } = object.pose
  const liftRef = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)

  useFrame((_, delta) => {
    const group = liftRef.current
    if (!group) return
    const target = selected ? LIFT : 0
    const current = group.position.y
    if (current === target) return
    const step = reducedMotion ? Infinity : delta * 0.12
    group.position.y = current + Math.sign(target - current) * Math.min(Math.abs(target - current), step)
    invalidate()
  })

  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    onHover(object.id)
    document.body.style.cursor = 'pointer'
  }
  const handleOut = () => {
    onHover(null)
    document.body.style.cursor = ''
  }
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > CLICK_SLOP) return
    event.stopPropagation()
    onSelect(object.id)
  }

  return (
    <group position={[position.x, position.y, position.z]} rotation-y={yaw}>
      <group ref={liftRef}>
        <Select enabled={selected}>
          <group onPointerOver={handleOver} onPointerOut={handleOut} onClick={handleClick}>
            <AssetView asset={object.asset} dimensions={object.dimensions} />
          </group>
        </Select>
        {hovered || selected ? <HoverTag object={object} sources={sources} /> : null}
      </group>
    </group>
  )
})

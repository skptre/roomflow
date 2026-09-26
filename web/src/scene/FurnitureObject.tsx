import { memo } from 'react'
import type { RoomObject } from '../domain/schema'
import { AssetView } from './AssetView'

/** One placed object: pose (bottom-center + yaw) around its visual asset. */
export const FurnitureObject = memo(function FurnitureObject({ object }: { object: RoomObject }) {
  const { position, yaw } = object.pose
  return (
    <group position={[position.x, position.y, position.z]} rotation-y={yaw}>
      <AssetView asset={object.asset} dimensions={object.dimensions} />
    </group>
  )
})

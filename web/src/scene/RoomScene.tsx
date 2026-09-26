import { Canvas } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import type { Room, Vec2 } from '../domain/schema'
import { Architecture } from './Architecture'
import { CameraRig } from './CameraRig'
import { wallsToCut } from './cutaway'
import { Effects } from './Effects'
import { Lighting } from './Lighting'
import { FurnitureObject } from './FurnitureObject'
import { disposeSharedMaterials } from './materials'
import { palette } from './palette'
import { disposePartGeometries } from './partGeometry'
import { roomSphere } from './roomBounds'

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id))
}

/** The room canvas: dollhouse overview with cutaway walls. Renders on demand. */
export function RoomScene({ room }: { room: Room }) {
  const reducedMotion = useReducedMotion() ?? false
  const [cut, setCut] = useState<ReadonlySet<string>>(() => new Set())
  const { radius } = roomSphere(room)

  const onViewChange = useCallback(
    (cameraDir: Vec2) => {
      setCut((previous) => {
        const next = wallsToCut(room.walls, room.floorPolygon, cameraDir, previous)
        return sameSet(previous, next) ? previous : next
      })
    },
    [room.walls, room.floorPolygon],
  )

  useEffect(
    () => () => {
      disposeSharedMaterials()
      disposePartGeometries()
    },
    [],
  )

  return (
    <Canvas
      className="!absolute inset-0"
      shadows
      frameloop="demand"
      dpr={[1, 2]}
      gl={{ antialias: false }}
      camera={{ fov: 35, position: [6, 6, 6] }}
      scene={{ environmentIntensity: 0.35 }}
    >
      <color attach="background" args={[palette.background]} />
      <Lighting room={room} />
      <Architecture room={room} cut={cut} reducedMotion={reducedMotion} />
      {room.objects.map((object) => (
        <FurnitureObject key={object.id} object={object} />
      ))}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.081} receiveShadow>
        <circleGeometry args={[radius * 3, 64]} />
        <meshStandardMaterial color={palette.ground} roughness={1} />
      </mesh>
      <CameraRig room={room} onViewChange={onViewChange} />
      <Effects />
    </Canvas>
  )
}

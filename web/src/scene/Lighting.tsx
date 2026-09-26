import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Object3D, PMREMGenerator } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Room } from '../domain/schema'
import { outwardNormal } from './cutaway'
import { palette } from './palette'
import { roomSphere } from './roomBounds'

/**
 * Soft sky fill, one warm key light that enters through the first window
 * (so window openings throw light into the room), shadows fit to the room,
 * and a local RoomEnvironment for gentle reflections (no remote HDR).
 */
export function Lighting({ room }: { room: Room }) {
  const { center, radius } = roomSphere(room)
  const keyPosition = useMemo((): [number, number, number] => {
    const window = room.openings.find((opening) => opening.kind === 'window')
    const wall = window ? room.walls.find((w) => w.id === window.wallId) : undefined
    const normal = wall ? outwardNormal(wall, room.floorPolygon) : null
    if (!window || !wall || !normal) return [center[0] + radius, radius * 1.6, center[2] + radius * 0.6]
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) || 1
    const t = window.offsetAlongWall / length
    const x = wall.start.x + (wall.end.x - wall.start.x) * t
    const z = wall.start.z + (wall.end.z - wall.start.z) * t
    return [x + normal.x * radius * 1.2, radius * 1.4, z + normal.z * radius * 1.2]
  }, [room, center, radius])

  const target = useMemo(() => {
    const object = new Object3D()
    object.position.set(center[0], 0, center[2])
    return object
  }, [center])

  return (
    <>
      <SceneEnvironment />
      <hemisphereLight args={[palette.lightSky, palette.lightGround, 0.75]} />
      <primitive object={target} />
      <directionalLight
        position={keyPosition}
        target={target}
        color={palette.lightKey}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-radius * 1.3}
        shadow-camera-right={radius * 1.3}
        shadow-camera-top={radius * 1.3}
        shadow-camera-bottom={-radius * 1.3}
        shadow-camera-near={0.1}
        shadow-camera-far={radius * 6}
      />
    </>
  )
}

/** Local RoomEnvironment reflections, attached to the scene and disposed on unmount. */
export function SceneEnvironment() {
  const gl = useThree((state) => state.gl)
  const environment = useMemo(() => {
    const pmrem = new PMREMGenerator(gl)
    const source = new RoomEnvironment()
    const texture = pmrem.fromScene(source, 0.04).texture
    source.dispose()
    pmrem.dispose()
    return texture
  }, [gl])
  useEffect(() => () => environment.dispose(), [environment])
  // Attaches to the scene (this component's parent) and detaches on unmount.
  return <primitive object={environment} attach="environment" />
}

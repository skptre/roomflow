import { Selection } from '@react-three/postprocessing'
import { Canvas } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { designStore, type PurchaseSources } from '../domain/designStore'
import { isWallHung } from '../domain/categories'
import { hostWall } from '../domain/layout'
import type { Room, Vec2 } from '../domain/schema'
import { Architecture } from './Architecture'
import { CameraRig, type ViewRequest } from './CameraRig'
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
export function RoomScene({
  room,
  sources,
  decorative = false,
  viewRequest,
  onInspect,
}: {
  room: Room
  sources: PurchaseSources
  decorative?: boolean
  viewRequest?: ViewRequest
  onInspect?: () => void
}) {
  const previewActive = useStore(designStore, (state) => state.preview !== null)
  const selectedId = useStore(designStore, (state) => state.selectedId)
  const hoveredId = useStore(designStore, (state) => state.hoveredId)
  const onHover = useCallback((id: string | null) => designStore.getState().hover(id), [])
  const onSelect = useCallback(
    (id: string) => {
      designStore.getState().select(id)
      onInspect?.()
    },
    [onInspect],
  )
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
      onPointerMissed={() => {
        if (!decorative) designStore.getState().select(null)
      }}
      aria-label={decorative ? undefined : '3D room preview. Use the furniture list for keyboard editing.'}
      aria-hidden={decorative || undefined}
    >
      <Selection>
        <Lighting room={room} />
        <Architecture room={room} cut={cut} reducedMotion={reducedMotion} />
        {room.objects.map((object) => (
          <FurnitureObject
            key={object.id}
            object={object}
            editable={!decorative && !previewActive}
            selected={!decorative && object.id === selectedId}
            // Art on a wall that is cut away for the dollhouse view goes with it instead of floating.
            hidden={isWallHung(object) && cut.has(hostWall(room, object) ?? '')}
            hovered={!decorative && object.id === hoveredId}
            sources={sources}
            reducedMotion={reducedMotion}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
        {/* Shadow catcher: the model sits on the plain backdrop and only its shadow darkens it. */}
        <mesh rotation-x={-Math.PI / 2} position-y={-0.081} receiveShadow>
          <circleGeometry args={[radius * 4, 64]} />
          <shadowMaterial color={palette.shadow} opacity={0.22} />
        </mesh>
        <CameraRig room={room} onViewChange={onViewChange} viewRequest={viewRequest} />
        <Effects />
      </Selection>
    </Canvas>
  )
}

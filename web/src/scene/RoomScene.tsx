import { Selection } from '@react-three/postprocessing'
import { Canvas } from '@react-three/fiber'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { designStore, type PurchaseSources } from '../domain/designStore'
import { isWallMounted } from '../domain/categories'
import { hostWall } from '../domain/layout'
import type { Room, Vec2 } from '../domain/schema'
import { Architecture } from './Architecture'
import { CameraRig, type ViewRequest } from './CameraRig'
import { wallsToCut } from './cutaway'
import { Effects } from './Effects'
import { Lighting } from './Lighting'
import { FurnitureObject } from './FurnitureObject'
import { HeroBed } from './HeroBed'
import { disposeIdleModels } from '../blocks/build'
import { disposeBlockMaterials } from '../blocks/materials'
import { disposeSharedMaterials } from './materials'

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id))
}

/** The room canvas: dollhouse overview with cutaway walls. Renders on demand. */
export function RoomScene({
  room,
  sources,
  decorative = false,
  heroLoop = false,
  viewRequest,
  onInspect,
}: {
  room: Room
  sources: PurchaseSources
  decorative?: boolean
  heroLoop?: boolean
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
  // Begin at the intended dollhouse view instead of briefly showing a closed room.
  const [cut, setCut] = useState<ReadonlySet<string>>(() =>
    wallsToCut(room.walls, room.floorPolygon, { x: Math.sin((35 * Math.PI) / 180), z: Math.cos((35 * Math.PI) / 180) }, new Set()),
  )

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
      disposeBlockMaterials()
      disposeIdleModels()
    },
    [],
  )

  return (
    <Canvas
      className="!absolute inset-0"
      shadows
      frameloop={heroLoop && !reducedMotion ? 'always' : 'demand'}
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
        {room.objects.map((object) => heroLoop && object.category === 'bed' ? (
          <HeroBed key={object.id} object={object} sources={sources} reducedMotion={reducedMotion} />
        ) : (
          <FurnitureObject
            key={object.id}
            object={object}
            editable={!decorative && !previewActive}
            selected={!decorative && object.id === selectedId}
            // Keep art visible when its wall drops away: otherwise the cutaway makes a scanned painting
            // disappear exactly when the room view is meant to reveal it. Built-ins and mirrors still go
            // with their wall because their geometry depends on it.
            hidden={object.category !== 'wall-art' && isWallMounted(object) && cut.has(hostWall(room, object) ?? '')}
            hovered={!decorative && object.id === hoveredId}
            sources={sources}
            reducedMotion={reducedMotion}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
        <CameraRig room={room} onViewChange={onViewChange} viewRequest={viewRequest} framing={decorative ? 'hero' : 'editor'} fixed={decorative} />
        <Effects />
      </Selection>
    </Canvas>
  )
}

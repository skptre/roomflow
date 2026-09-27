import { Select } from '@react-three/postprocessing'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { memo, useEffect, useRef, useState } from 'react'
import { Mesh, type Group, type Intersection, type Raycaster } from 'three'
import { checkPlacement, collisions, type PlacementCheck } from '../domain/commands'
import { isWallHung } from '../domain/categories'
import { isRaised } from '../domain/geometry'
import { designStore, type PurchaseSources } from '../domain/designStore'
import { coversOpening, slideOnWall, wallPlacement } from '../domain/layout'
import type { RoomObject, Vec2, Wall } from '../domain/schema'
import { normalizeYaw } from '../domain/units'
import { moveObject, refuseLockedMove, rotateObject } from '../ui/editorActions'
import { noticeStore } from '../ui/noticeStore'
import { ArtPhoto } from './ArtPhoto'
import { AssetView } from './AssetView'
import { floorPoint, wallPoint, yawOf } from './floorPointer'
import { gestureOutcome } from './gesture'
import { HoverTag } from './HoverTag'
import { palette } from './palette'

/** How far a selected object rises, as a subtle "picked up" cue (meters). */
const LIFT = 0.015
/** Pointer travel (px) before a press becomes a drag instead of a click. */
const DRAG_SLOP = 4
const SNAP = Math.PI / 36 // 5°
const SNAP_COARSE = Math.PI / 12 // 15° with Shift
/** Draw order for the rotate ring: after furniture, rugs, and outlines. */
const HANDLE_RENDER_ORDER = 10

/**
 * Raycast that reports every hit at distance 0, so a handle wins R3F's
 * nearest-first event order even when a rug or other furniture sits above it.
 */
function raycastOnTop(this: Mesh, raycaster: Raycaster, intersects: Intersection[]) {
  const start = intersects.length
  Mesh.prototype.raycast.call(this, raycaster, intersects)
  for (const hit of intersects.slice(start)) hit.distance = 0
}

type FurnitureObjectProps = {
  object: RoomObject
  editable?: boolean
  selected: boolean
  hovered: boolean
  /** Hidden with the cut-away wall it hangs on. */
  hidden: boolean
  sources: PurchaseSources
  reducedMotion: boolean
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}

type Gesture = {
  kind: 'move' | 'rotate'
  startX: number
  startY: number
  active: boolean
  /** move: floor offset from the object's origin to the grab point. */
  grab: Vec2
  /** rotate: pointer angle and object yaw when the gesture began. */
  startAngle: number
  startYaw: number
  /** Latest live pose (not yet committed). */
  position: Vec2
  yaw: number
  status: PlacementCheck['status']
  overlaps: string[]
  /** A hung piece slides on its own wall: the wall, the grab offset on it, and the live bottom height. */
  onWall?: { wall: Wall; grabAlong: number; grabHeight: number; y: number }
}

function currentRoom() {
  return designStore.getState().committed?.room ?? null
}

/**
 * One placed object: pose (bottom-center + yaw) around its visual asset, with
 * hover, selection, drag-to-move on the floor, and a rotate ring. The live pose
 * during a gesture lives in refs (no store writes per frame); release commits
 * one validated command, or snaps back if the spot is invalid.
 */
export const FurnitureObject = memo(function FurnitureObject({
  object,
  editable = true,
  selected,
  hovered,
  hidden,
  sources,
  reducedMotion,
  onHover,
  onSelect,
}: FurnitureObjectProps) {
  const { position, yaw } = object.pose
  const poseRef = useRef<Group>(null)
  const liftRef = useRef<Group>(null)
  const gesture = useRef<Gesture | null>(null)
  const [feedback, setFeedback] = useState<PlacementCheck['status'] | null>(null)
  const camera = useThree((state) => state.camera)
  const element = useThree((state) => state.gl.domElement)
  const getState = useThree((state) => state.get)
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

  // Remove window listeners if the object unmounts mid-gesture.
  const cleanupRef = useRef<() => void>(() => {})
  useEffect(() => () => cleanupRef.current(), [])

  /** Turn camera orbiting on/off (the default controls are read lazily from the R3F store). */
  function setOrbit(enabled: boolean) {
    const controls = getState().controls as { enabled: boolean } | null
    if (controls) controls.enabled = enabled
  }

  function snapBack() {
    poseRef.current?.position.set(position.x, position.y, position.z)
    poseRef.current?.rotation.set(0, yaw, 0)
    invalidate()
  }

  function beginGesture(event: ThreeEvent<PointerEvent>, kind: Gesture['kind']) {
    if (!editable || event.button !== 0 || hidden) return
    event.stopPropagation()
    const hit = floorPoint(event.clientX, event.clientY, camera, element)
    if (!hit) return
    // Pressing on an object never orbits the camera; releasing restores orbiting.
    setOrbit(false)
    gesture.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      grab: { x: hit.x - position.x, z: hit.z - position.z },
      startAngle: yawOf(hit.x - position.x, hit.z - position.z),
      startYaw: yaw,
      position: { x: position.x, z: position.z },
      yaw,
      status: 'ok',
      overlaps: [],
    }
    // A painting or mirror drags along its own wall (left/right, up/down), never off it.
    if (kind === 'move' && isWallHung(object)) {
      const room = currentRoom()
      const placement = room ? wallPlacement(room, object) : null
      const onWall = placement ? wallPoint(event.clientX, event.clientY, camera, element, placement.wall) : null
      if (placement && onWall) {
        gesture.current.onWall = {
          wall: placement.wall,
          grabAlong: onWall.along - placement.along,
          grabHeight: onWall.height - placement.bottom,
          y: position.y,
        }
      }
    }

    const onMove = (move: PointerEvent) => {
      const g = gesture.current
      if (!g) return
      if (!g.active) {
        if (Math.hypot(move.clientX - g.startX, move.clientY - g.startY) < DRAG_SLOP) return
        if (object.lockPlacement) {
          refuseLockedMove(object)
          finish()
          return
        }
        if (g.kind === 'move' && isRaised(object) && !g.onWall) {
          noticeStore.getState().show(`${object.name} is on a wall or tabletop and can't be dragged yet. Remove it and add it again to place it elsewhere.`, 'warning')
          finish()
          return
        }
        g.active = true
        onSelect(object.id)
        document.body.style.cursor = g.kind === 'move' ? 'grabbing' : 'alias'
      }
      if (g.onWall) {
        const room = currentRoom()
        const hit = wallPoint(move.clientX, move.clientY, camera, element, g.onWall.wall)
        const slid = room && hit ? slideOnWall(room, object, hit.along - g.onWall.grabAlong, hit.height - g.onWall.grabHeight) : null
        if (!room || !slid) return
        g.position = { x: slid.pose.position.x, z: slid.pose.position.z }
        g.onWall.y = slid.pose.position.y
        poseRef.current?.position.set(slid.pose.position.x, slid.pose.position.y, slid.pose.position.z)
        g.overlaps = collisions(room, slid).map((other) => other.id)
        g.status = g.overlaps.length > 0 || coversOpening(room, slid) ? 'overlap' : 'ok'
        setFeedback(g.status)
        invalidate()
        return
      }
      const point = floorPoint(move.clientX, move.clientY, camera, element)
      const room = currentRoom()
      if (!point || !room) return
      if (g.kind === 'move') {
        g.position = { x: point.x - g.grab.x, z: point.z - g.grab.z }
        poseRef.current?.position.set(g.position.x, position.y, g.position.z)
      } else {
        const snap = move.shiftKey ? SNAP_COARSE : SNAP
        const raw = g.startYaw + yawOf(point.x - position.x, point.z - position.z) - g.startAngle
        g.yaw = normalizeYaw(Math.round(raw / snap) * snap)
        poseRef.current?.rotation.set(0, g.yaw, 0)
      }
      const check = checkPlacement(room, object.id, g.position, g.yaw)
      g.status = check.status
      g.overlaps = check.overlaps
      setFeedback(check.status)
      invalidate()
    }

    const end = (cancelled: boolean) => {
      const g = gesture.current
      finish()
      if (!g?.active) return
      if (gestureOutcome({ kind: g.kind, status: g.status, cancelled }) === 'snap-back') {
        snapBack()
        if (cancelled) return
        const room = currentRoom()
        const names = g.overlaps.map((id) => room?.objects.find((o) => o.id === id)?.name ?? 'another item')
        noticeStore
          .getState()
          .show(
            g.status === 'outside'
              ? `${object.name} doesn't fit there.`
              : names.length === 0
                ? `${object.name} would cover a window or door.`
                : `${object.name} would overlap ${names.join(', ')}.`,
            'warning',
          )
        return
      }
      const committed =
        g.kind === 'move' ? moveObject(object.id, g.position, g.onWall?.y) : rotateObject(object.id, g.yaw, { rejectOverlap: true })
      if (!committed) snapBack()
    }
    const onUp = () => end(false)
    // An interrupted gesture (OS gesture, lost pointer) never applies an edit.
    const onCancel = () => end(true)

    function finish() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      cleanupRef.current = () => {}
      setOrbit(true)
      document.body.style.cursor = ''
      gesture.current = null
      setFeedback(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    cleanupRef.current = finish
  }

  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    if (hidden) return
    event.stopPropagation()
    onHover(object.id)
    if (!gesture.current)
      document.body.style.cursor = !editable ? 'default' : object.lockPlacement ? 'not-allowed' : 'grab'
  }
  const handleOut = () => {
    onHover(null)
    if (!gesture.current) document.body.style.cursor = ''
  }
  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!editable || event.delta > DRAG_SLOP || hidden) return
    event.stopPropagation()
    onSelect(object.id)
  }

  const { width, depth } = object.dimensions
  const ringRadius = Math.hypot(width, depth) / 2 + 0.12

  return (
    <group ref={poseRef} position={[position.x, position.y, position.z]} rotation-y={yaw} visible={!hidden}>
      {feedback ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.004} renderOrder={1}>
          <planeGeometry args={[width, depth]} />
          <meshBasicMaterial
            color={feedback === 'ok' ? palette.selection : palette.invalid}
            transparent
            opacity={0.32}
            depthWrite={false}
          />
        </mesh>
      ) : null}
      {selected && editable && !object.lockPlacement && !isWallHung(object) ? (
        <group>
          {/* Wide invisible grab band; the visible ring stays thin. */}
          <mesh
            rotation-x={-Math.PI / 2}
            position-y={0.006}
            raycast={raycastOnTop}
            onPointerDown={(event) => beginGesture(event, 'rotate')}
            onPointerOver={(event) => {
              event.stopPropagation()
              document.body.style.cursor = 'alias'
            }}
            onPointerOut={() => {
              if (!gesture.current) document.body.style.cursor = ''
            }}
          >
            <ringGeometry args={[ringRadius - 0.07, ringRadius + 0.07, 64]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.006} renderOrder={HANDLE_RENDER_ORDER} raycast={() => null}>
            <ringGeometry args={[ringRadius - 0.02, ringRadius + 0.02, 64]} />
            <meshBasicMaterial color={palette.selection} transparent opacity={0.75} depthWrite={false} depthTest={false} />
          </mesh>
          {/* Knob on the front (+Z) side shows which way the object faces. */}
          <mesh position={[0, 0.02, ringRadius]} renderOrder={HANDLE_RENDER_ORDER} raycast={() => null}>
            <sphereGeometry args={[0.035, 16, 12]} />
            <meshBasicMaterial color={palette.selection} depthTest={false} />
          </mesh>
        </group>
      ) : null}
      <group ref={liftRef}>
        <Select enabled={selected}>
          <group
            onPointerOver={handleOver}
            onPointerOut={handleOut}
            onPointerDown={(event) => beginGesture(event, 'move')}
            onClick={handleClick}
          >
            <AssetView asset={object.asset} dimensions={object.dimensions} category={object.category} />
            {object.category === 'wall-art' ? <ArtPhoto objectId={object.id} dimensions={object.dimensions} /> : null}
          </group>
        </Select>
        {(hovered || selected) && !feedback ? <HoverTag object={object} sources={sources} /> : null}
      </group>
    </group>
  )
})

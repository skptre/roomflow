import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Room, Vec2 } from '../domain/schema'
import { roomSphere } from './roomBounds'

const ELEVATION = (40 * Math.PI) / 180
const AZIMUTH = (35 * Math.PI) / 180
const MARGIN = 1.08

export type ViewRequest = { action: 'home' | 'top' | 'zoom-in' | 'zoom-out' | 'left' | 'right'; sequence: number }

type CameraRigProps = {
  viewRequest?: ViewRequest
  room: Room
  framing?: 'hero' | 'editor'
  fixed?: boolean
  /** Horizontal part of the unit vector from target to camera, reported on every camera change. */
  onViewChange: (cameraDir: Vec2) => void
}

/**
 * Dollhouse orbit camera. Frames the room once per room id (so later layout
 * changes and panel resizes never reset the user's orbit), with a clamped,
 * damped orbit.
 */
export function CameraRig({ room, onViewChange, viewRequest, framing = 'editor', fixed = false }: CameraRigProps) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const sizeRef = useRef(size)
  sizeRef.current = size
  const sphere = roomSphere(room)
  const scratch = useRef(new Vector3())

  const report = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return
    const toCamera = scratch.current.copy(camera.position).sub(controls.target).normalize()
    onViewChange({ x: toCamera.x, z: toCamera.z })
  }, [camera, onViewChange])

  // Fit once per room: both vertical and horizontal field of view must contain the sphere.
  const roomId = room.id
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !(camera instanceof PerspectiveCamera)) return
    const { center, radius } = roomSphere(room)
    const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height)
    const vFov = (camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * (framing === 'hero' ? 0.9 : MARGIN)
    camera.position.set(
      center[0] + distance * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
      center[1] + distance * Math.sin(ELEVATION),
      center[2] + distance * Math.cos(ELEVATION) * Math.cos(AZIMUTH),
    )
    camera.near = Math.max(0.05, distance / 100)
    camera.far = distance * 10
    camera.updateProjectionMatrix()
    controls.target.set(center[0], center[1] * 0.35, center[2])
    controls.update()
    report()
    invalidate()
    // Only a different room re-frames; edits to the same room keep the user's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !viewRequest || !(camera instanceof PerspectiveCamera)) return
    const { center, radius } = roomSphere(room)
    const offset = camera.position.clone().sub(controls.target)
    const action = viewRequest.action
    if (action === 'home' || action === 'top') {
      const aspect = sizeRef.current.width / Math.max(1, sizeRef.current.height)
      const vFov = (camera.fov * Math.PI) / 180
      const fov = Math.min(vFov, 2 * Math.atan(Math.tan(vFov / 2) * aspect))
      const distance = (radius / Math.sin(fov / 2)) * MARGIN
      const elevation = action === 'top' ? Math.PI / 2 - 0.16 : ELEVATION
      controls.target.set(center[0], center[1] * 0.35, center[2])
      camera.position
        .copy(controls.target)
        .add(
          new Vector3(
            Math.cos(elevation) * Math.sin(AZIMUTH),
            Math.sin(elevation),
            Math.cos(elevation) * Math.cos(AZIMUTH),
          ).multiplyScalar(distance),
        )
    } else if (action === 'left' || action === 'right') {
      offset.applyAxisAngle(new Vector3(0, 1, 0), action === 'left' ? -Math.PI / 8 : Math.PI / 8)
      camera.position.copy(controls.target).add(offset)
    } else {
      const distance = Math.max(
        radius * 0.6,
        Math.min(radius * 5, offset.length() * (action === 'zoom-in' ? 0.82 : 1.22)),
      )
      camera.position.copy(controls.target).add(offset.setLength(distance))
    }
    controls.update()
    report()
    invalidate()
    // Only an explicit view request reframes; selecting or editing leaves the camera alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableRotate={!fixed}
      enablePan={!fixed}
      enableZoom={!fixed}
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.15}
      maxPolarAngle={1.38}
      minDistance={sphere.radius * 0.6}
      maxDistance={sphere.radius * 5}
      onChange={report}
    />
  )
}

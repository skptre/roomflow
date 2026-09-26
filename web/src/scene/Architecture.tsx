import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ExtrudeGeometry, MeshStandardMaterial, Shape, Vector2, type Mesh } from 'three'
import type { Opening, Room, Vec2, Wall } from '../domain/schema'
import { outwardNormal } from './cutaway'
import { proceduralTexture } from './materials'
import { palette } from './palette'
import { slabWallProfile, wallLength, wallShapes, wallThickness } from './wallGeometry'

/** Thickness of the floor slab under the room (reads as an architectural model base). */
export const SLAB = 0.08
/** Height above the floor that cut walls drop to. */
export const STUB_HEIGHT = 0.3
const CUT_SECONDS = 0.28

type ArchitectureProps = {
  room: Room
  cut: ReadonlySet<string>
  reducedMotion: boolean
}

/** Floor slab, walls with openings, and door/window frames for a room. */
export function Architecture({ room, cut, reducedMotion }: ArchitectureProps) {
  return (
    <group>
      <Floor polygon={room.floorPolygon} color={room.finishes.floor} />
      {room.walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          openings={room.openings}
          floorPolygon={room.floorPolygon}
          color={room.finishes.wall}
          cut={cut.has(wall.id)}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  )
}

function Floor({ polygon, color }: { polygon: readonly Vec2[]; color: string }) {
  const geometry = useMemo(() => {
    // Shape (x, -z) rotated -90° about X lands on (x, 0, z); extrusion then points up.
    const shape = new Shape(polygon.map((p) => new Vector2(p.x, -p.z)))
    const extruded = new ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false })
    extruded.translate(0, 0, -SLAB)
    return extruded
  }, [polygon])
  // Materials are owned here (not by JSX) so unmounting never disposes the shared wood texture.
  const materials = useMemo(
    () => [
      new MeshStandardMaterial({ color, map: proceduralTexture('woodgrain'), roughness: 0.72 }),
      new MeshStandardMaterial({ color: palette.trim, roughness: 0.9 }),
    ],
    [color],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials])

  // ExtrudeGeometry groups: 0 = top/bottom caps, 1 = sides.
  return <mesh geometry={geometry} material={materials} rotation-x={-Math.PI / 2} receiveShadow dispose={null} />
}

type Placement = {
  /** Unit direction along the wall and its outward/left normal on the floor. */
  dir: Vec2
  normal: Vec2
  yaw: number
  /** Local Z range of the slab relative to the wall line. */
  zOffset: number
  thickness: number
  extend: number
}

function placementOf(wall: Wall, floorPolygon: readonly Vec2[]): Placement {
  const length = wallLength(wall) || 1
  const dir = { x: (wall.end.x - wall.start.x) / length, z: (wall.end.z - wall.start.z) / length }
  const left = { x: -dir.z, z: dir.x }
  const thickness = wallThickness(wall)
  // Rotating by yaw maps local +X to dir and local +Z to the left normal.
  const yaw = Math.atan2(-dir.z, dir.x)
  if (!wall.exterior) return { dir, normal: left, yaw, zOffset: -thickness / 2, thickness, extend: 0 }
  // Exterior walls: the scanned plane is the inner face, so thickness grows outward,
  // and both ends extend by the thickness to close the outside corners.
  const out = outwardNormal(wall, floorPolygon) ?? left
  const outIsLeft = out.x * left.x + out.z * left.z > 0
  return { dir, normal: out, yaw, zOffset: outIsLeft ? 0 : -thickness, thickness, extend: thickness }
}

function extrudeProfile(wall: Wall, openings: readonly Opening[], placement: Placement, maxHeight?: number) {
  const polygons = slabWallProfile(wall, openings, { slab: SLAB, extend: placement.extend, maxHeight })
  const geometry = new ExtrudeGeometry(wallShapes(polygons), { depth: placement.thickness, bevelEnabled: false })
  geometry.translate(0, 0, placement.zOffset)
  return geometry
}

type WallMeshProps = {
  wall: Wall
  openings: readonly Opening[]
  floorPolygon: readonly Vec2[]
  color: string
  cut: boolean
  reducedMotion: boolean
}

function WallMesh({ wall, openings, floorPolygon, color, cut, reducedMotion }: WallMeshProps) {
  const invalidate = useThree((state) => state.invalidate)
  const placement = useMemo(() => placementOf(wall, floorPolygon), [wall, floorPolygon])
  const own = useMemo(() => openings.filter((o) => o.wallId === wall.id), [openings, wall.id])
  const full = useMemo(() => extrudeProfile(wall, own, placement), [wall, own, placement])
  const stub = useMemo(() => extrudeProfile(wall, own, placement, STUB_HEIGHT), [wall, own, placement])
  useEffect(() => () => full.dispose(), [full])
  useEffect(() => () => stub.dispose(), [stub])

  // Animate the full wall's height toward the stub (or back), then swap in the exact stub geometry.
  const meshRef = useRef<Mesh>(null)
  const heightRef = useRef(cut ? STUB_HEIGHT : wall.height)
  // The cut state whose target height has been reached (settled when it equals `cut`).
  const [settledFor, setSettledFor] = useState(cut)
  const settled = settledFor === cut
  useEffect(() => invalidate(), [cut, invalidate])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const target = cut ? STUB_HEIGHT : wall.height
    const current = heightRef.current
    if (current !== target) {
      const speed = (wall.height - STUB_HEIGHT) / CUT_SECONDS
      const step = reducedMotion ? Infinity : speed * delta
      heightRef.current = current + Math.sign(target - current) * Math.min(Math.abs(target - current), step)
      invalidate()
    } else if (!settled) {
      setSettledFor(cut)
    }
    const showStub = settled && cut
    // Scale the full wall about its base (y = -SLAB) so the top sits at the animated height.
    const scale = showStub ? 1 : (heightRef.current + SLAB) / (wall.height + SLAB)
    mesh.scale.y = scale
    mesh.position.y = SLAB * (scale - 1)
  })

  // Owned here (not by JSX) so unmounting never disposes the shared plaster texture.
  const material = useMemo(
    () => new MeshStandardMaterial({ color, map: proceduralTexture('plaster'), roughness: 0.92 }),
    [color],
  )
  useEffect(() => () => material.dispose(), [material])
  const showStub = settled && cut
  const standing = settled && !cut

  return (
    <group position={[wall.start.x, 0, wall.start.z]} rotation-y={placement.yaw}>
      <mesh
        ref={meshRef}
        geometry={showStub ? stub : full}
        material={material}
        castShadow
        receiveShadow
        dispose={null}
      />
      {standing
        ? own.map((opening) => <OpeningFrame key={opening.id} opening={opening} placement={placement} wall={wall} />)
        : null}
    </group>
  )
}

const FRAME = 0.045

/** Simple jambs/head (and sill + glass for windows) inside an opening, in the wall's local frame. */
function OpeningFrame({ opening, placement, wall }: { opening: Opening; placement: Placement; wall: Wall }) {
  const length = wallLength(wall)
  const u0 = Math.max(0, opening.offsetAlongWall - opening.width / 2)
  const u1 = Math.min(length, opening.offsetAlongWall + opening.width / 2)
  const top = Math.min(wall.height, opening.bottom + opening.height)
  const bottom = opening.bottom
  // Nothing visible to frame (e.g. an opening entirely above the wall top).
  if (u1 <= u0 || top <= bottom) return null
  const width = u1 - u0
  const height = top - bottom
  const depth = placement.thickness + 0.02
  const z = placement.zOffset + placement.thickness / 2
  const cx = (u0 + u1) / 2

  const pieces: Array<{ key: string; position: [number, number, number]; size: [number, number, number] }> = [
    { key: 'l', position: [u0 + FRAME / 2, bottom + height / 2, z], size: [FRAME, height, depth] },
    { key: 'r', position: [u1 - FRAME / 2, bottom + height / 2, z], size: [FRAME, height, depth] },
    { key: 't', position: [cx, top - FRAME / 2, z], size: [width, FRAME, depth] },
  ]
  if (opening.kind === 'window' && bottom > 0.01) {
    pieces.push({ key: 'b', position: [cx, bottom + FRAME / 2, z], size: [width, FRAME, depth + 0.03] })
  }

  return (
    <group>
      {pieces.map((piece) => (
        <mesh key={piece.key} position={piece.position} castShadow>
          <boxGeometry args={piece.size} />
          <meshStandardMaterial color={palette.trim} roughness={0.6} />
        </mesh>
      ))}
      {opening.kind === 'window' ? (
        <mesh position={[cx, bottom + height / 2, z]}>
          <planeGeometry args={[width - FRAME * 2, height - FRAME * 2]} />
          <meshPhysicalMaterial
            color={palette.glass}
            transparent
            opacity={0.22}
            roughness={0.05}
            metalness={0}
            depthWrite={false}
            side={2}
          />
        </mesh>
      ) : null}
    </group>
  )
}

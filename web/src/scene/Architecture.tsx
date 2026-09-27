import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ExtrudeGeometry, MeshStandardMaterial, Shape, Vector2, type Mesh } from 'three'
import type { Opening, Room, Vec2, Wall } from '../domain/schema'
import { outwardNormal } from './cutaway'
import { proceduralTexture } from './materials'
import { palette, paletteName } from './palette'
import { slabWallProfile, wallLength, wallShapes, wallThickness } from './wallGeometry'
import { wallFaceColors, type FaceColors } from './zonePaint'

/** Thickness of the floor slab under the room (reads as an architectural model base). */
export const SLAB = 0.08
/** Height above the floor that cut walls drop to. */
export const STUB_HEIGHT = 0.3
const CUT_SECONDS = 0.28
/** How far short of a neighboring wall's outer face an exterior wall's corner extension stops (m). */
const CORNER_TUCK = 0.001

type ArchitectureProps = {
  room: Room
  cut: ReadonlySet<string>
  reducedMotion: boolean
}

/** Floor slab, walls with openings, and door/window frames for a room. */
export function Architecture({ room, cut, reducedMotion }: ArchitectureProps) {
  // The dev palette toggle (?palette=…) previews its own wall/floor colors over the room's finishes.
  const devPalette = paletteName !== 'warm'
  const finishes = devPalette ? { ...room.finishes, wall: palette.wall, floor: palette.floor } : room.finishes
  const zones = devPalette ? [] : (room.zones ?? [])
  return (
    <group>
      <Floor polygon={room.floorPolygon} color={finishes.floor} texture={finishes.floorTexture ?? 'woodgrain'} />
      {zones.map((zone) => (
        <Floor key={zone.id} polygon={zone.polygon} color={zone.finishes.floor} texture={zone.finishes.floorTexture ?? 'woodgrain'} inlay />
      ))}
      {room.walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          openings={room.openings}
          floorPolygon={room.floorPolygon}
          colors={devPalette ? { left: palette.wall, right: palette.wall } : wallFaceColors(room, wall)}
          cut={cut.has(wall.id)}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  )
}

/** A zone's floor is laid this far over the room's floor, covering it. */
const INLAY = 0.0015

type FloorTexture = 'woodgrain' | 'plain' | 'tile'

/**
 * The floor slab, or with `inlay` a zone's floor laid over it. `plain`: a matte
 * floor with no pattern (a color sampled from the real room, or carpet).
 */
function Floor({ polygon, color, texture, inlay = false }: { polygon: readonly Vec2[]; color: string; texture: FloorTexture; inlay?: boolean }) {
  const geometry = useMemo(() => {
    // Shape (x, -z) rotated -90° about X lands on (x, 0, z); extrusion then points up.
    const shape = new Shape(polygon.map((p) => new Vector2(p.x, -p.z)))
    const extruded = new ExtrudeGeometry(shape, { depth: inlay ? INLAY : SLAB, bevelEnabled: false })
    if (!inlay) extruded.translate(0, 0, -SLAB)
    return extruded
  }, [polygon, inlay])
  // Materials are owned here (not by JSX) so unmounting never disposes the shared textures.
  const materials = useMemo(
    () => [
      texture === 'plain'
        ? new MeshStandardMaterial({ color, roughness: 0.95 })
        : new MeshStandardMaterial({ color, map: proceduralTexture(texture), roughness: texture === 'tile' ? 0.45 : 0.72 }),
      new MeshStandardMaterial({ color: palette.trim, roughness: 0.9 }),
    ],
    [color, texture],
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
  // Each end stops CORNER_TUCK short of the neighbor's outer face, so its end cap sits just inside that
  // wall instead of on the same plane as its face (coplanar faces z-fight: a flickering zigzag at corners).
  return { dir, normal: out, yaw, zOffset: outIsLeft ? 0 : -thickness, thickness, extend: thickness - CORNER_TUCK }
}

function extrudeProfile(wall: Wall, openings: readonly Opening[], placement: Placement, maxHeight?: number) {
  const polygons = slabWallProfile(wall, openings, { slab: SLAB, extend: placement.extend, maxHeight })
  const geometry = new ExtrudeGeometry(wallShapes(polygons), { depth: placement.thickness, bevelEnabled: false })
  geometry.translate(0, 0, placement.zOffset)
  splitFaces(geometry)
  return geometry
}

/**
 * Regroup an extruded wall so its two faces can take different paint:
 * 0 = the right face (local −Z), 1 = cut edges (top, ends, reveals), 2 = the
 * left face (local +Z). ExtrudeGeometry puts both faces in one group (0).
 */
function splitFaces(geometry: ExtrudeGeometry) {
  const normal = geometry.getAttribute('normal')
  const groups = geometry.groups
  const faces = groups.find((group) => group.materialIndex === 0)
  if (!faces || geometry.index) return
  const right: number[] = []
  const left: number[] = []
  const edges: number[] = []
  for (const group of groups) {
    for (let v = group.start; v < group.start + group.count; v += 3) {
      const triangle = [v, v + 1, v + 2]
      if (group.materialIndex !== 0) edges.push(...triangle)
      else if (normal.getZ(v) > 0) left.push(...triangle)
      else right.push(...triangle)
    }
  }
  geometry.setIndex([...right, ...edges, ...left])
  geometry.clearGroups()
  geometry.addGroup(0, right.length, 0)
  geometry.addGroup(right.length, edges.length, 1)
  geometry.addGroup(right.length + edges.length, left.length, 2)
}

type WallMeshProps = {
  wall: Wall
  openings: readonly Opening[]
  floorPolygon: readonly Vec2[]
  colors: FaceColors
  cut: boolean
  reducedMotion: boolean
}

function WallMesh({ wall, openings, floorPolygon, colors, cut, reducedMotion }: WallMeshProps) {
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

  // Groups (see splitFaces): 0 = right face, 1 = cut edges in a darker section tone, 2 = left face.
  // Owned here (not by JSX) so unmounting never disposes the shared plaster texture.
  const { left, right } = colors
  const materials = useMemo(
    () => [
      new MeshStandardMaterial({ color: right, map: proceduralTexture('plaster'), roughness: 0.92 }),
      new MeshStandardMaterial({ color: palette.wallSection, roughness: 0.95 }),
      new MeshStandardMaterial({ color: left, map: proceduralTexture('plaster'), roughness: 0.92 }),
    ],
    [left, right],
  )
  useEffect(() => () => materials.forEach((material) => material.dispose()), [materials])
  const showStub = settled && cut
  const standing = settled && !cut

  return (
    <group position={[wall.start.x, 0, wall.start.z]} rotation-y={placement.yaw}>
      <mesh
        ref={meshRef}
        geometry={showStub ? stub : full}
        material={materials}
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
const LEAF = 0.04
/** How far an open door swings into the room. */
const OPEN_ANGLE = (75 * Math.PI) / 180
/** Knob height above the door's bottom. */
const KNOB_HEIGHT = 0.95

/**
 * Which way is into the room in the wall's local frame (+1: local +Z, -1: local -Z).
 * An exterior wall's normal points outside; an interior wall has rooms on both sides.
 */
function intoRoom(wall: Wall, placement: Placement): 1 | -1 {
  if (!wall.exterior) return 1
  const left = { x: -placement.dir.z, z: placement.dir.x }
  return placement.normal.x * left.x + placement.normal.z * left.z > 0 ? -1 : 1
}

/** A door leaf in its frame, closed or swung open into the room from its left jamb, with a knob on each face. */
function DoorLeaf({ opening, wall, placement, u0, width, bottom, height }: { opening: Opening; wall: Wall; placement: Placement; u0: number; width: number; bottom: number; height: number }) {
  const leafW = width - FRAME * 2 - 0.004
  const leafH = height - FRAME - 0.012
  if (leafW <= 0.1 || leafH <= 0.3) return null
  const side = intoRoom(wall, placement)
  const center = placement.zOffset + placement.thickness / 2
  // Closed: in the middle of the wall. Open: hinged at the room-side face so it swings clear of the wall.
  const hingeZ = opening.open ? center + side * (placement.thickness / 2 - LEAF / 2) : center
  const knobY = Math.min(KNOB_HEIGHT, leafH * 0.5) - leafH / 2
  return (
    <group position={[u0 + FRAME + 0.002, bottom + 0.006 + leafH / 2, hingeZ]} rotation-y={opening.open ? -side * OPEN_ANGLE : 0}>
      <mesh position={[leafW / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[leafW, leafH, LEAF]} />
        <meshStandardMaterial color={palette.trim} roughness={0.55} />
      </mesh>
      {[1, -1].map((face) => (
        <mesh key={face} position={[leafW - 0.07, knobY, face * (LEAF / 2 + 0.018)]} castShadow>
          <sphereGeometry args={[0.024, 16, 12]} />
          <meshStandardMaterial color={palette.shadow} roughness={0.35} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

/** Simple jambs/head (and sill + glass for windows, a leaf for doors) inside an opening, in the wall's local frame. */
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
      {opening.kind === 'door' ? <DoorLeaf opening={opening} wall={wall} placement={placement} u0={u0} width={width} bottom={bottom} height={height} /> : null}
    </group>
  )
}

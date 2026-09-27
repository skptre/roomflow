import { Html, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Size } from '../../blocks/family'
import { FAMILIES, FAMILY_SAMPLES } from '../../blocks/families'
import type { Recipe } from '../../blocks/recipe'
import { Effects } from '../Effects'
import { SceneEnvironment } from '../Lighting'
import { palette } from '../palette'
import { RecipeMesh } from '../RecipeMesh'

type Cell = { key: string; label: string; recipe: Recipe; size: Size; x: number; z: number }

const GAP = 0.55
const COLUMNS = 5

/** Every family: its default, then each non-default block option on its own, at each sample size. */
function layout(only: string | null, filter: string[], image: string | null): { cells: Cell[]; width: number; depth: number } {
  const cells: Cell[] = []
  let z = 0
  let width = 0
  for (const family of Object.values(FAMILIES)) {
    if (only && family.id !== only) continue
    const variants: Array<{ label: string; blocks: Record<string, string> }> = [{ label: 'default', blocks: {} }]
    for (const [name, spec] of Object.entries(family.blocks)) {
      for (const option of spec.options) {
        if (option !== (typeof spec.default === 'string' ? spec.default : undefined)) variants.push({ label: `${name}: ${option}`, blocks: { [name]: option } })
      }
    }
    if (filter.length > 0) {
      const kept = variants.filter((v) => filter.some((f) => v.label.includes(f)))
      variants.splice(0, variants.length, ...kept)
    }
    const samples = FAMILY_SAMPLES[family.id]!
    const sizes = only && filter.length === 0 ? samples : [samples[0]!]
    // Shape options (sectional, chaise…) only make sense at the deepest sample size.
    const deepest = samples.reduce((a, b) => (b.depth > a.depth ? b : a))
    const columns = only ? COLUMNS : variants.length
    for (const [sizeIndex, size] of sizes.entries()) {
      // Other sample sizes show the default only (the variants are all on the first).
      const shown = sizeIndex === 0 ? variants : variants.slice(0, 1)
      let x = 0
      let rowDepth = 0
      for (const [index, variant] of shown.entries()) {
        if (index > 0 && index % columns === 0) {
          width = Math.max(width, x)
          x = 0
          z += rowDepth + GAP + 0.35
          rowDepth = 0
        }
        const cellSize = variant.label.startsWith('shape') ? deepest : size
        cells.push({
          key: `${family.id}|${size.width}|${variant.label}`,
          label: `${family.label} · ${variant.label}`,
          recipe: {
            schemaVersion: 1,
            id: `dev:${family.id}:${variant.label}`,
            family: family.id,
            blocks: variant.blocks,
            params: {},
            tier: 'default',
            ...(image && family.imageSlot ? { image: { url: image } } : {}),
          },
          size: cellSize,
          x: x + cellSize.width / 2,
          z: z + cellSize.depth / 2,
        })
        x += cellSize.width + GAP
        rowDepth = Math.max(rowDepth, cellSize.depth)
      }
      width = Math.max(width, x)
      z += rowDepth + GAP + 0.35
    }
  }
  return { cells, width, depth: z }
}

/**
 * Dev-only QA sheet: every family and block option, labeled. ?blocks (all), ?blocks=<family>,
 * &v=<label part,…> to pick variants, &img=<https url> to show a product photo on art/rugs.
 */
export function BlockSheet({ only, filter = [], image = null }: { only: string | null; filter?: string[]; image?: string | null }) {
  const { cells, width, depth } = useMemo(() => layout(only, filter, image), [only, filter, image])
  const span = Math.max(width, depth, 1.5)
  const center: [number, number, number] = [width / 2, 0.4, depth / 2]
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: false }}
      camera={{ fov: 30, position: [center[0] + span * 0.35, span * 0.6 + 0.6, center[2] + span * 1.1 + 0.8], near: 0.05, far: 400 }}
      scene={{ environmentIntensity: 0.35 }}
      className="!absolute inset-0"
    >
      <color attach="background" args={[palette.background]} />
      <SceneEnvironment />
      <hemisphereLight args={[palette.lightSky, palette.lightGround, 0.8]} />
      <directionalLight
        position={[center[0] + span * 0.3, span * 0.6 + 4, center[2] + span * 0.4]}
        intensity={2.4}
        color={palette.lightKey}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-far={span * 4 + 20}
      >
        <object3D attach="target" position={center} />
      </directionalLight>
      <mesh rotation-x={-Math.PI / 2} position={[center[0], 0, center[2]]} receiveShadow>
        <planeGeometry args={[width + 4, depth + 4]} />
        <meshStandardMaterial color={palette.ground} />
      </mesh>
      {cells.map((cell) => (
        <group key={cell.key} position={[cell.x, 0, cell.z]}>
          <RecipeMesh recipe={cell.recipe} dimensions={cell.size} />
          <Html position={[0, 0, cell.size.depth / 2 + 0.18]} center zIndexRange={[10, 0]}>
            <span className="pointer-events-none whitespace-nowrap text-[10px] text-muted">{cell.label}</span>
          </Html>
        </group>
      ))}
      <OrbitControls makeDefault target={center} />
      <Effects />
    </Canvas>
  )
}

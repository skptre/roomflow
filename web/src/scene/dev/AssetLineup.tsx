import { Html, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { CATEGORIES } from '../../domain/categories'
import type { AssetRef } from '../../domain/schema'
import { AssetView, Placeholder } from '../AssetView'
import { Effects } from '../Effects'
import { SceneEnvironment } from '../Lighting'
import { palette } from '../palette'

type Entry = { key: string; label: string; asset: AssetRef; size: { width: number; height: number; depth: number } }

const entries: Entry[] = [
  ...Object.entries(CATEGORIES).flatMap(([key, info]): Entry[] =>
    info.assemblyId ? [{ key, label: info.label, asset: { kind: 'parametric', assemblyId: info.assemblyId }, size: info.typical }] : [],
  ),
  { key: 'glb', label: 'GLB (test box)', asset: { kind: 'glb', url: '/dev/test-box.glb' }, size: { width: 0.6, height: 0.6, depth: 0.6 } },
  { key: 'missing', label: 'Missing assembly', asset: { kind: 'parametric', assemblyId: 'does-not-exist' }, size: { width: 0.6, height: 0.8, depth: 0.5 } },
]

const COLUMNS = 6
const CELL = 2.6

/** Dev-only view (open with ?lineup): every asset at its typical size, for visual review. */
export function AssetLineup() {
  const rows = Math.ceil((entries.length + 1) / COLUMNS)
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: false }}
      camera={{ fov: 32, position: [0, 13, 19] }}
      scene={{ environmentIntensity: 0.35 }}
      className="!absolute inset-0"
    >
      <color attach="background" args={[palette.background]} />
      <SceneEnvironment />
      <hemisphereLight args={[palette.lightSky, palette.lightGround, 0.9]} />
      <directionalLight
        position={[6, 10, 6]}
        intensity={2.2}
        color={palette.lightKey}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[COLUMNS * CELL + 2, rows * CELL + 2]} />
        <meshStandardMaterial color={palette.ground} />
      </mesh>
      {entries.map((entry, index) => {
        const x = ((index % COLUMNS) - (COLUMNS - 1) / 2) * CELL
        const z = (Math.floor(index / COLUMNS) - (rows - 1) / 2) * CELL
        return (
          <group key={entry.key} position={[x, entry.key === 'wall-art' || entry.key === 'mirror' ? 0.02 : 0, z]}>
            <AssetView asset={entry.asset} dimensions={entry.size} />
            <Html position={[0, -0.05, entry.size.depth / 2 + 0.35]} center>
              <span className="whitespace-nowrap text-xs text-muted">{entry.label}</span>
            </Html>
          </group>
        )
      })}
      <group position={[((entries.length % COLUMNS) - (COLUMNS - 1) / 2) * CELL, 0, (Math.floor(entries.length / COLUMNS) - (rows - 1) / 2) * CELL]}>
        <Placeholder dimensions={{ width: 0.8, height: 0.9, depth: 0.6 }} label="Preparing model" />
      </group>
      <OrbitControls makeDefault target={[0, 0.5, 0]} />
      <Effects />
    </Canvas>
  )
}

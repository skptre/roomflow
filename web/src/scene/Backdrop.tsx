import { Canvas } from '@react-three/fiber'
import { palette } from './palette'

/** Full-bleed 3D base layer shown behind the start screen until a room is open. */
export function Backdrop() {
  return (
    <Canvas
      className="!absolute inset-0"
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [4, 4.5, 6], fov: 35 }}
      aria-hidden="true"
    >
      <color attach="background" args={[palette.background]} />
      <hemisphereLight args={[palette.lightSky, palette.lightGround, 1.6]} />
      <directionalLight position={[3, 6, 2]} intensity={1.4} color={palette.lightKey} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.001}>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color={palette.ground} />
      </mesh>
    </Canvas>
  )
}

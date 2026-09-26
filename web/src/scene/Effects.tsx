import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

/** Contact shading (ambient occlusion), edge smoothing, and filmic tone mapping. */
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={0.45} distanceFalloff={0.6} intensity={2.2} halfRes quality="medium" />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  )
}

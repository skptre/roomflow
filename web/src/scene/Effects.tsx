import { EffectComposer, N8AO, Outline, SMAA, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { palette } from './palette'

/**
 * Contact shading (ambient occlusion), a selection outline (objects wrapped in
 * <Select enabled> inside <Selection>), edge smoothing, and tone mapping.
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0} autoClear={false}>
      <N8AO aoRadius={0.22} distanceFalloff={0.75} intensity={0.9} halfRes quality="medium" />
      <Outline visibleEdgeColor={palette.selection} hiddenEdgeColor={palette.selection} edgeStrength={4} blur />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}

import type { AssetRef } from '../domain/schema'
import { getAssembly } from '../fixtures/assemblies'
import type { Appearance } from './contract'

/** Only our authored templates and colors; no generated code, geometry or URLs. */
export function appearanceAsset(value: Appearance): AssetRef {
  const assemblyId = { armchair: 'scan-armchair', loveseat: 'scan-loveseat', sofa: 'scan-sofa' }[value.template as 'armchair' | 'loveseat' | 'sofa'] ?? value.template
  const assembly = getAssembly(assemblyId)
  if (!assembly) return { kind: 'placeholder' }
  const recolor: Record<string, string> = {}
  for (const part of assembly.parts) {
    // Leave small hardware, lights and decoration alone.
    if (part.material === 'fabric' || part.name === 'top' || part.name === 'frame') recolor[part.color.toLowerCase()] = value.color
  }
  if (assemblyId.startsWith('scan-')) recolor['#8091a0'] = value.backColor
  return { kind: 'parametric', assemblyId, recolor }
}

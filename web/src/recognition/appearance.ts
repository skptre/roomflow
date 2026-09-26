import type { Command } from '../domain/commands'
import { Appearance } from './contract'
export { Appearance } from './contract'

export function appearanceCommand(id: string, value: Appearance, model: string): Command {
  return { type: 'setAppearance', id, appearance: Appearance.parse(value), model }
}

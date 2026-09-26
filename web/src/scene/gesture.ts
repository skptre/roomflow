import type { PlacementCheck } from '../domain/commands'

export type GestureEnd = { kind: 'move' | 'rotate'; status: PlacementCheck['status']; cancelled: boolean }

/**
 * What releasing a drag or rotate gesture does. A cancelled gesture never
 * commits. A move commits only onto a valid spot. A rotation that would overlap
 * snaps back; one that only pokes outside goes to the rotate command, which
 * nudges it back inside — and is still refused if that nudged pose overlaps
 * (rotateObject with rejectOverlap).
 */
export function gestureOutcome({ kind, status, cancelled }: GestureEnd): 'commit' | 'snap-back' {
  if (cancelled) return 'snap-back'
  if (kind === 'move') return status === 'ok' ? 'commit' : 'snap-back'
  return status === 'overlap' ? 'snap-back' : 'commit'
}

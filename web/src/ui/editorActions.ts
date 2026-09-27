/**
 * User edit actions shared by the inspector, keyboard shortcuts, and direct
 * manipulation. Each goes through the store's validated command pipeline as a
 * user action and reports refusals and warnings as notices.
 */
import { isWallHung } from '../domain/categories'
import { applyCommands, type Command } from '../domain/commands'
import { designStore, type ApplyResult } from '../domain/designStore'
import { coversOpening, slideOnWall, wallPlacement } from '../domain/layout'
import type { RoomObject, Vec2 } from '../domain/schema'
import { noticeStore } from './noticeStore'

export const ROTATE_STEP = Math.PI / 12 // 15°

function report(result: ApplyResult, info: string[] = []): boolean {
  if (!result.ok) {
    noticeStore.getState().show(result.error, 'danger')
    return false
  }
  const messages = [...info, ...result.warnings.slice(0, 1)]
  if (messages.length > 0) noticeStore.getState().show(messages.join(' '), result.warnings.length > 0 ? 'warning' : 'info')
  return true
}

function run(commands: Command[]): boolean {
  return report(designStore.getState().apply(commands, { actor: 'user' }))
}

function selectedObject(): RoomObject | null {
  const { committed, selectedId } = designStore.getState()
  return committed?.room.objects.find((object) => object.id === selectedId) ?? null
}

/** Move an object on the floor plan; `y` also sets its bottom height (a piece slid up or down its wall). */
export function moveObject(id: string, position: Vec2, y?: number): boolean {
  return run([y === undefined ? { type: 'move', id, position } : { type: 'move', id, position, y }])
}

/**
 * Slide a hung piece on its own wall: `right` and `up` in meters, as seen by
 * someone facing it. It stays on the wall; refused if it would cover a window or door.
 */
export function nudgeOnWall(id: string, right: number, up: number): boolean {
  const room = designStore.getState().committed?.room
  const object = room ? objectById(id) : null
  const placement = room && object ? wallPlacement(room, object) : null
  if (!room || !object || !placement) return false
  const { wall } = placement
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) || 1
  // Facing the piece (looking at its front), your right is its local +X: (cos yaw, −sin yaw).
  const localX = { x: Math.cos(object.pose.yaw), z: -Math.sin(object.pose.yaw) }
  const sign = ((wall.end.x - wall.start.x) * localX.x + (wall.end.z - wall.start.z) * localX.z) / length > 0 ? 1 : -1
  const slid = slideOnWall(room, object, placement.along + sign * right, placement.bottom + up)
  if (!slid) return false
  if (coversOpening(room, slid)) {
    noticeStore.getState().show(`${object.name} would cover a window or door.`, 'warning')
    return false
  }
  return moveObject(id, { x: slid.pose.position.x, z: slid.pose.position.z }, slid.pose.position.y)
}

function objectById(id: string): RoomObject | null {
  return designStore.getState().committed?.room.objects.find((object) => object.id === id) ?? null
}

/**
 * Turn an object; if the room had to slide it to keep it inside, say so. With
 * `rejectOverlap` (direct manipulation), the final pose — after any nudge — is
 * checked first and the turn is refused if it would overlap something.
 */
export function rotateObject(id: string, yaw: number, options: { rejectOverlap?: boolean } = {}): boolean {
  const before = objectById(id)
  const committed = designStore.getState().committed
  if (options.rejectOverlap && committed) {
    const trial = applyCommands(committed.room, [{ type: 'rotate', id, yaw }], 'user')
    if (trial.ok && trial.warnings.length > 0) {
      noticeStore.getState().show(`${trial.warnings[0]} Turned it back.`, 'warning')
      return false
    }
  }
  const result = designStore.getState().apply([{ type: 'rotate', id, yaw }], { actor: 'user' })
  const after = result.ok ? objectById(id) : null
  const nudged =
    before && after && (before.pose.position.x !== after.pose.position.x || before.pose.position.z !== after.pose.position.z)
  return report(result, nudged ? [`Nudged ${after.name} to stay inside the room.`] : [])
}

export function rotateSelected(direction: 1 | -1, step = ROTATE_STEP): boolean {
  const object = selectedObject()
  if (!object) return false
  if (object.lockPlacement) {
    noticeStore.getState().show(`${object.name} is locked in place. Unlock it to turn it.`, 'warning')
    return false
  }
  if (isWallHung(object)) {
    noticeStore.getState().show(`${object.name} hangs on the wall, so it can't be turned.`, 'warning')
    return false
  }
  return rotateObject(object.id, object.pose.yaw + direction * step)
}

export function removeSelected(): boolean {
  const object = selectedObject()
  if (!object) return false
  const removed = run([{ type: 'remove', id: object.id }])
  if (removed) noticeStore.getState().show(`Removed ${object.name}. Undo to bring it back.`)
  return removed
}

export function setKeep(id: string, keep: boolean): boolean {
  return run([{ type: 'setKeep', id, keep }])
}

export function setLock(id: string, lock: boolean): boolean {
  return run([{ type: 'setLock', id, lock }])
}

export function undo(): boolean {
  return designStore.getState().undo()
}

export function redo(): boolean {
  return designStore.getState().redo()
}

/** Called when a drag on a locked object is attempted. */
export function refuseLockedMove(object: RoomObject) {
  noticeStore.getState().show(`${object.name} is locked in place. Unlock it to move it.`, 'warning')
}

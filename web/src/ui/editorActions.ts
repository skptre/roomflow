/**
 * User edit actions shared by the inspector, keyboard shortcuts, and direct
 * manipulation. Each goes through the store's validated command pipeline as a
 * user action and reports refusals and warnings as notices.
 */
import type { Command } from '../domain/commands'
import { designStore, type ApplyResult } from '../domain/designStore'
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

export function moveObject(id: string, position: Vec2): boolean {
  return run([{ type: 'move', id, position }])
}

function objectById(id: string): RoomObject | null {
  return designStore.getState().committed?.room.objects.find((object) => object.id === id) ?? null
}

/** Turn an object; if the room had to slide it to keep it inside, say so. */
export function rotateObject(id: string, yaw: number): boolean {
  const before = objectById(id)
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

/**
 * The one validated edit pipeline. Every change to a room — from direct
 * manipulation, the catalog, themes, or (later) AI proposals — is a list of
 * commands applied atomically: all succeed or the room is left unchanged.
 */
import { clampIntoRoom, footprintsOverlap, insideRoom } from './geometry'
import { Finishes, RoomObject, type Room, type Vec2 } from './schema'
import { normalizeYaw } from './units'

/** Who asked for the change. Automated changes must respect keep and lock. */
export type Actor = 'user' | 'auto'

/** Everything about an object that a replacement supplies; id and pose stay with the placement. */
export type Replacement = Omit<RoomObject, 'id' | 'pose'>

export type Command =
  | { type: 'add'; object: RoomObject }
  | { type: 'move'; id: string; position: Vec2 }
  | { type: 'rotate'; id: string; yaw: number }
  | { type: 'remove'; id: string }
  | { type: 'replace'; id: string; with: Replacement }
  | { type: 'setKeep'; id: string; keep: boolean }
  | { type: 'setLock'; id: string; lock: boolean }
  | { type: 'restyle'; finishes: Finishes }

export type CommandResult = { ok: true; room: Room; warnings: string[] } | { ok: false; error: string }

class CommandError extends Error {}

function objectIndex(room: Room, id: string): number {
  const index = room.objects.findIndex((object) => object.id === id)
  if (index < 0) throw new CommandError(`No object with id ${id} in this room.`)
  return index
}

function overlapWarning(room: Room, object: RoomObject): string | null {
  const others = room.objects.filter((other) => other.id !== object.id && footprintsOverlap(object, other))
  if (others.length === 0) return null
  return `${object.name} overlaps ${others.map((other) => other.name).join(', ')}.`
}

function withObject(room: Room, index: number, object: RoomObject): Room {
  const objects = room.objects.slice()
  objects[index] = object
  return { ...room, objects }
}

function applyOne(room: Room, command: Command, actor: Actor, warnings: string[]): Room {
  switch (command.type) {
    case 'add': {
      const parsed = RoomObject.safeParse(command.object)
      if (!parsed.success) throw new CommandError(`That item has invalid data (${parsed.error.issues[0]!.message}).`)
      const object = parsed.data
      if (room.objects.some((existing) => existing.id === object.id)) {
        throw new CommandError(`An object with id ${object.id} is already in the room.`)
      }
      if (!insideRoom(object, room.floorPolygon)) throw new CommandError(`${object.name} doesn't fit inside the room there.`)
      const warning = overlapWarning(room, object)
      if (warning) warnings.push(warning)
      return { ...room, objects: [...room.objects, object] }
    }

    case 'move': {
      const index = objectIndex(room, command.id)
      const object = room.objects[index]!
      if (actor === 'auto' && object.lockPlacement) throw new CommandError(`${object.name} is locked in place.`)
      if (!Number.isFinite(command.position.x) || !Number.isFinite(command.position.z)) {
        throw new CommandError('Invalid position.')
      }
      const moved: RoomObject = {
        ...object,
        pose: { ...object.pose, position: { x: command.position.x, y: object.pose.position.y, z: command.position.z } },
      }
      if (!insideRoom(moved, room.floorPolygon)) throw new CommandError(`${object.name} can't go outside the room.`)
      const warning = overlapWarning(room, moved)
      if (warning) warnings.push(warning)
      return withObject(room, index, moved)
    }

    case 'rotate': {
      const index = objectIndex(room, command.id)
      const object = room.objects[index]!
      if (actor === 'auto' && object.lockPlacement) throw new CommandError(`${object.name} is locked in place.`)
      if (!Number.isFinite(command.yaw)) throw new CommandError('Invalid rotation.')
      const turned: RoomObject = { ...object, pose: { ...object.pose, yaw: normalizeYaw(command.yaw) } }
      // A rotated footprint near a wall may poke out; slide it back in without changing size or yaw.
      const pose = clampIntoRoom(turned, room.floorPolygon)
      if (!pose) throw new CommandError(`${object.name} doesn't fit in the room at that angle.`)
      const rotated = { ...turned, pose }
      const warning = overlapWarning(room, rotated)
      if (warning) warnings.push(warning)
      return withObject(room, index, rotated)
    }

    case 'remove': {
      const index = objectIndex(room, command.id)
      const object = room.objects[index]!
      if (actor === 'auto' && object.keep) throw new CommandError(`${object.name} is marked to keep.`)
      return { ...room, objects: room.objects.filter((_, i) => i !== index) }
    }

    case 'replace': {
      const index = objectIndex(room, command.id)
      const object = room.objects[index]!
      if (actor === 'auto' && object.keep) throw new CommandError(`${object.name} is marked to keep.`)
      // Placement state (id, pose, lock) belongs to the spot in the room, not the product.
      const parsed = RoomObject.safeParse({
        ...command.with,
        id: object.id,
        pose: object.pose,
        lockPlacement: object.lockPlacement,
      })
      if (!parsed.success) throw new CommandError(`That item has invalid data (${parsed.error.issues[0]!.message}).`)
      const candidate = parsed.data
      // A different footprint may need a nudge to stay inside; a locked item must not move.
      const pose = clampIntoRoom(candidate, room.floorPolygon)
      if (!pose) throw new CommandError(`${candidate.name} doesn't fit where ${object.name} is.`)
      const moved = pose.position.x !== object.pose.position.x || pose.position.z !== object.pose.position.z
      if (moved && actor === 'auto' && object.lockPlacement) {
        throw new CommandError(`${candidate.name} doesn't fit where the locked ${object.name} is.`)
      }
      const replaced = { ...candidate, pose }
      const warning = overlapWarning(room, replaced)
      if (warning) warnings.push(warning)
      return withObject(room, index, replaced)
    }

    case 'setKeep': {
      if (typeof command.keep !== 'boolean') throw new CommandError('Invalid keep value.')
      const index = objectIndex(room, command.id)
      return withObject(room, index, { ...room.objects[index]!, keep: command.keep })
    }

    case 'setLock': {
      if (typeof command.lock !== 'boolean') throw new CommandError('Invalid lock value.')
      const index = objectIndex(room, command.id)
      return withObject(room, index, { ...room.objects[index]!, lockPlacement: command.lock })
    }

    case 'restyle': {
      const parsed = Finishes.safeParse(command.finishes)
      if (!parsed.success) throw new CommandError('Invalid finish colors.')
      return { ...room, finishes: parsed.data }
    }
  }
}

export type PlacementCheck = { status: 'ok' | 'overlap' | 'outside'; overlaps: string[] }

/**
 * Would this object fit at a candidate position and yaw? Used for live feedback
 * while dragging or rotating, before any command is applied. "outside" wins
 * over "overlap" because an outside placement will be refused.
 */
export function checkPlacement(room: Room, id: string, position: Vec2, yaw: number): PlacementCheck {
  const object = room.objects.find((candidate) => candidate.id === id)
  if (!object) throw new Error(`No object with id ${id} in this room.`)
  const moved = { ...object, pose: { position: { x: position.x, y: object.pose.position.y, z: position.z }, yaw } }
  if (!insideRoom(moved, room.floorPolygon)) return { status: 'outside', overlaps: [] }
  const overlaps = room.objects.filter((other) => other.id !== id && footprintsOverlap(moved, other)).map((other) => other.id)
  return { status: overlaps.length > 0 ? 'overlap' : 'ok', overlaps }
}

/** Apply commands in order. Returns a new room; the input room is never mutated. */
export function applyCommands(room: Room, commands: readonly Command[], actor: Actor): CommandResult {
  const warnings: string[] = []
  try {
    let next = room
    for (const command of commands) next = applyOne(next, command, actor, warnings)
    return { ok: true, room: next, warnings }
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.message }
    throw error
  }
}

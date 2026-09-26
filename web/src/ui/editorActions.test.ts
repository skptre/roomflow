import { beforeEach, describe, expect, it } from 'vitest'
import { designStore } from '../domain/designStore'
import { sampleRoom } from '../test/rooms'
import { rotateObject } from './editorActions'
import { noticeStore } from './noticeStore'

beforeEach(() => {
  designStore.getState().loadRoom(sampleRoom())
  noticeStore.getState().dismiss()
})

describe('rotateObject', () => {
  it('says so when the room nudged the item to keep it inside', () => {
    // The desk sits flush against the east wall; turned 90° its long side pokes through it.
    expect(rotateObject('OBJ-DESK', 0)).toBe(true)
    expect(noticeStore.getState().notice?.text).toMatch(/nudged/i)
  })

  it('stays quiet when the rotation fits where it is', () => {
    expect(rotateObject('OBJ-CHAIR', 0)).toBe(true)
    expect(noticeStore.getState().notice).toBeNull()
  })
})

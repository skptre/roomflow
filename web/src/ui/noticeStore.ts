/** Transient, polite status messages (e.g. "Bed is locked in place"). One at a time. */
import { createStore } from 'zustand/vanilla'

export type NoticeTone = 'info' | 'warning' | 'danger'
export type Notice = { id: number; text: string; tone: NoticeTone }

type NoticeState = {
  notice: Notice | null
  show: (text: string, tone?: NoticeTone) => void
  dismiss: (id?: number) => void
}

const DISPLAY_MS = 3200
let nextId = 1
let timer: ReturnType<typeof setTimeout> | undefined

export const noticeStore = createStore<NoticeState>()((set, get) => ({
  notice: null,
  show(text, tone = 'info') {
    const id = nextId++
    set({ notice: { id, text, tone } })
    clearTimeout(timer)
    timer = setTimeout(() => get().dismiss(id), DISPLAY_MS)
  },
  dismiss(id) {
    const current = get().notice
    if (current && (id === undefined || current.id === id)) set({ notice: null })
  },
}))

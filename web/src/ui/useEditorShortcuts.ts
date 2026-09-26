import { useEffect } from 'react'
import { designStore } from '../domain/designStore'
import { redo, removeSelected, rotateSelected, undo } from './editorActions'

function typingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Room editing shortcuts: R / Shift+R rotate ±15°, Delete/Backspace remove,
 * Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo, Escape clears selection.
 * Ignored while typing in a field.
 */
export function useEditorShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (typingInField(event.target)) return
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (mod && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && key === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if (mod || event.altKey) return

      const hasSelection = designStore.getState().selectedId !== null
      if (key === 'r' && hasSelection) {
        event.preventDefault()
        rotateSelected(event.shiftKey ? -1 : 1)
      } else if ((key === 'delete' || key === 'backspace') && hasSelection) {
        event.preventDefault()
        removeSelected()
      } else if (key === 'escape' && hasSelection) {
        designStore.getState().select(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

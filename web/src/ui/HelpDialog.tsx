import { useEffect, useRef } from 'react'
import { StudioIcon } from './StudioIcon'

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="help-dialog"
      aria-labelledby="help-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="help-body">
        <button className="dialog-close" aria-label="Close help" onClick={onClose}>
          <StudioIcon name="close" />
        </button>
        <span className="eyebrow">SETTLE IN</span>
        <h2 id="help-title">Make yourself at home</h2>
        <p>Start with one thing you’d like to change. There’s always undo.</p>
        <dl>
          <div>
            <dt>Look around</dt>
            <dd>Drag an empty part of the room to orbit. Scroll to zoom, or use the view buttons.</dd>
          </div>
          <div>
            <dt>Make a move</dt>
            <dd>
              Select a piece in the room or the furniture list. Drag it, or use the movement buttons in its details.
            </dd>
          </div>
          <div>
            <dt>Try something new</dt>
            <dd>
              Find a piece, choose “Try in my room,” then add it or cancel. Your budget only changes when you apply it.
            </dd>
          </div>
          <div>
            <dt>A few handy keys</dt>
            <dd>
              <kbd>R</kbd> Rotate · <kbd>Esc</kbd> Cancel preview / selection
              <br />
              <kbd>⌘ / Ctrl Z</kbd> Undo · <kbd>Delete</kbd> Remove
            </dd>
          </div>
        </dl>
        <p className="session-note">
          This design lives in your current session. Reloading or closing the page clears your edits.
        </p>
        <button className="studio-primary full-width" onClick={onClose}>
          Let’s make room
          <StudioIcon name="arrow" />
        </button>
      </div>
    </dialog>
  )
}

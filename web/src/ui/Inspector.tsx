import { useEffect, useId, useRef, useState } from 'react'
import { AppearanceDialog } from './AppearanceDialog'
import type { PurchaseSources } from '../domain/designStore'
import { isWallHung } from '../domain/categories'
import { faceAxes, formatLength, priceLabel, provenanceLabel } from '../domain/labels'
import type { RoomObject } from '../domain/schema'
import { moveObject, nudgeOnWall, removeSelected, rotateSelected, setKeep, setLock } from './editorActions'
import { FurnitureThumbnail } from './FurnitureThumbnail'
import { RotateLeftIcon, RotateRightIcon, TrashIcon } from './icons'
import { StudioIcon } from './StudioIcon'

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = useId()
  return (
    <label className="inspector-toggle">
      <span>
        <strong>{label}</strong>
        <span id={id}>{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={id}
      />
      <span className="switch-track" aria-hidden="true" />
    </label>
  )
}
export function Inspector({
  object,
  sources,
  onBrowseAlternatives,
  onClose,
}: {
  object: RoomObject
  sources: PurchaseSources
  onBrowseAlternatives: () => void
  onClose: () => void
}) {
  const [matchPhoto, setMatchPhoto] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [object.id])
  const price = priceLabel(object, sources)
  const { width, height, depth, source } = object.dimensions
  // A flat thing's size is its face (a print's width and height); its thickness is never listed.
  const face = faceAxes(object.category)
  const measurements = (
    [
      ['Width', 'width', width],
      ['Depth', 'depth', depth],
      ['Height', 'height', height],
    ] as const
  )
    .filter(([, axis]) => !face || face.includes(axis))
    .map(([label, , value]) => [label, value] as const)
  // A hung piece's arrows slide it on its wall (← → along it, ↑ ↓ up and down); everything else moves on the floor plan.
  const onWall = isWallHung(object)
  function nudge(x: number, z: number) {
    if (onWall) nudgeOnWall(object.id, x, -z)
    else moveObject(object.id, { x: object.pose.position.x + x, z: object.pose.position.z + z })
  }
  return (
    <section className="inspector-content" aria-label={`${object.name} details`}>
      <button className="text-back" onClick={onClose}>
        <StudioIcon name="back" size={16} />
        All my furniture
      </button>
      <div className="inspector-hero">
        <FurnitureThumbnail asset={object.asset} dimensions={object.dimensions} category={object.category} />
        <span>{price.text}</span>
      </div>
      <div className="inspector-title">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h2 ref={heading} tabIndex={-1}>
            {object.name}
          </h2>
        </div>
        <span className="small-label">
          {object.fidelity === 'exact'
            ? 'Exact model'
            : object.fidelity === 'placeholder'
              ? 'Simple preview'
              : 'Approximate look'}
        </span>
      </div>
      <button className="studio-primary full-width" onClick={onBrowseAlternatives}>
        <StudioIcon name="search" size={17} />
        Try a different piece
        <StudioIcon name="arrow" size={17} />
      </button>
      {(object.sourceKind === 'captured' || object.sourceKind === 'owned') && <button className="studio-secondary full-width" onClick={() => setMatchPhoto(true)}>Match appearance from photo</button>}
      {object.appearance && <p className="small-label">Appearance estimated from a photo · measurements unchanged</p>}
      {matchPhoto && <AppearanceDialog key={object.id} object={object} onClose={() => setMatchPhoto(false)} />}
      <div className="inspector-section">
        <h3>A place for everything</h3>
        <p>{onWall ? 'Drag it along the wall, or move in 10 cm steps below.' : 'Drag in the room, or move in 10 cm steps below.'}</p>
        <div className="placement-controls">
          <div className="nudge-grid" role="group" aria-label={onWall ? 'Move on the wall' : 'Move on the room floor'}>
            <button
              aria-label={onWall ? 'Move up 10 cm' : 'Move toward back wall 10 cm'}
              disabled={object.lockPlacement}
              onClick={() => nudge(0, -0.1)}
            >
              ↑
            </button>
            <button
              aria-label={onWall ? 'Move left along the wall 10 cm' : 'Move left on floor plan 10 cm'}
              disabled={object.lockPlacement}
              onClick={() => nudge(-0.1, 0)}
            >
              ←
            </button>
            <span aria-hidden="true">
              10<small>cm</small>
            </span>
            <button
              aria-label={onWall ? 'Move right along the wall 10 cm' : 'Move right on floor plan 10 cm'}
              disabled={object.lockPlacement}
              onClick={() => nudge(0.1, 0)}
            >
              →
            </button>
            <button
              aria-label={onWall ? 'Move down 10 cm' : 'Move toward front of room 10 cm'}
              disabled={object.lockPlacement}
              onClick={() => nudge(0, 0.1)}
            >
              ↓
            </button>
          </div>
          <div className="turn-controls">
            <span>Turn a little</span>
            <div>
              <button
                aria-label="Turn left 15 degrees"
                disabled={object.lockPlacement || isWallHung(object)}
                onClick={() => rotateSelected(1)}
              >
                <RotateLeftIcon />
                15°
              </button>
              <button
                aria-label="Turn right 15 degrees"
                disabled={object.lockPlacement || isWallHung(object)}
                onClick={() => rotateSelected(-1)}
              >
                <RotateRightIcon />
                15°
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="inspector-section">
        <Toggle
          label="Keep this favorite"
          hint="Keep it in future designs. It can still move."
          checked={object.keep}
          onChange={(value) => setKeep(object.id, value)}
        />
        <Toggle
          label="Just right here"
          hint="Lock its position and the way it faces."
          checked={object.lockPlacement}
          onChange={(value) => setLock(object.id, value)}
        />
      </div>
      <details className="measurements">
        <summary>
          Measurements <span>{provenanceLabel(source)}</span>
        </summary>
        <dl>
          {measurements.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{formatLength(value)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <button className="remove-piece" onClick={() => removeSelected()}>
        <TrashIcon />
        Remove from room<span>You can undo this</span>
      </button>
    </section>
  )
}

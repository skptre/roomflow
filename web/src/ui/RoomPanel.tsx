import { useEffect, useRef } from 'react'
import type { Room, RoomObject } from '../domain/schema'
import { FurnitureThumbnail } from './FurnitureThumbnail'
import { StudioIcon } from './StudioIcon'

export function RoomPanel({
  room,
  onSelect,
  onBrowse,
  onAddPhoto,
  onImportPiece,
  onDesign,
}: {
  room: Room
  onSelect: (object: RoomObject) => void
  onBrowse: () => void
  onAddPhoto: () => void
  onImportPiece: () => void
  /** Opens the Gemini room designer (text-only request; consent is asked in the dialog). */
  onDesign: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <section className="room-panel" aria-label="Furniture in your room">
      <div className="room-panel-heading">
        <h2 ref={heading} tabIndex={-1}>Your furniture</h2>
        <span>{room.objects.length} pieces</span>
      </div>
      <div className="room-quick-actions">
        <button className="studio-primary full-width" onClick={onBrowse}>
          Find a piece <StudioIcon name="arrow" size={17} />
        </button>
        <div>
          <button className="studio-secondary" onClick={onImportPiece}>Import a scan</button>
          <button className="studio-secondary" onClick={onAddPhoto}>Add a photo</button>
        </div>
        <button className="studio-secondary full-width designer-entry" onClick={onDesign}>
          <StudioIcon name="sun" size={17} /> Design with Gemini
        </button>
      </div>
      <ul className="room-inventory">
        {room.objects.map((object) => (
          <li key={object.id}>
            <button onClick={() => onSelect(object)} aria-label={`Edit ${object.name}`}>
              <FurnitureThumbnail asset={object.asset} dimensions={object.dimensions} category={object.category} />
              <span className="inventory-label">
                <strong>{object.name}</strong>
                <span>
                  {object.lockPlacement
                    ? 'Locked in place'
                    : object.sourceKind === 'captured' || object.sourceKind === 'owned'
                      ? 'Already yours'
                      : 'Added to your room'}
                  {object.keep ? ' · Keeping' : ''}
                </span>
              </span>
              <StudioIcon name="chevron" size={16} />
            </button>
          </li>
        ))}
      </ul>
      {room.objects.length === 0 && <p className="empty-message">A fresh canvas. Find a piece to make it yours.</p>}
    </section>
  )
}

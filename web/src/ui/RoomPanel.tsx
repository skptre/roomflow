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
}: {
  room: Room
  onSelect: (object: RoomObject) => void
  onBrowse: () => void
  onAddPhoto: () => void
  onImportPiece: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <section className="room-panel" aria-label="Furniture in your room">
      <span className="eyebrow">START WITH WHAT YOU LOVE</span>
      <h2 ref={heading} tabIndex={-1}>
        Your furniture
      </h2>
      <p className="panel-intro">Keep your favorites. Move things around. Make a little space for something new.</p>
      <button className="inspiration-card" onClick={onBrowse}>
        <span className="inspiration-icon">
          <StudioIcon name="leaf" size={26} />
        </span>
        <span>
          <strong>Find something new</strong>
          <span>Find a piece that feels like you</span>
        </span>
        <StudioIcon name="arrow" size={18} />
      </button>
      <button className="studio-primary full-width" onClick={onImportPiece}>Import a scanned piece</button>
      <button className="studio-secondary full-width" onClick={onAddPhoto}>Add a piece from a photo</button>
      <div className="section-label">
        <h3>In your room</h3>
        <span>{room.objects.length} pieces</span>
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
      <div className="studio-note">
        <StudioIcon name="sun" size={20} />
        <p>
          There’s no single right way to feel at home.
          <br />
          <strong>Try something. You can always undo.</strong>
        </p>
      </div>
    </section>
  )
}

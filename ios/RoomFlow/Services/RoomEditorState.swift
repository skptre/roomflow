import Foundation
import Observation

/// The editable copy of a room plus the current selection.
/// The scanned room is kept untouched in `originalRoom`; edits only change `room`.
@Observable
final class RoomEditorState {
    private(set) var room: RoomModel
    let originalRoom: RoomModel
    var selectedObjectID: String?

    init(room: RoomModel) {
        self.room = room
        self.originalRoom = room
    }

    var selectedObject: RoomObject? {
        guard let selectedObjectID else { return nil }
        return room.objects.first { $0.id == selectedObjectID }
    }

    /// Selects the object under a floor point, or clears the selection on empty floor.
    /// `margin` (meters) makes small items like chairs easier to hit with a finger.
    func select(at point: FloorPoint, margin: Double) {
        selectedObjectID = FloorPlanGeometry.object(at: point, in: room.objects, margin: margin)?.id
    }
}

import Foundation
import RoomPlan

/// The only place that reads RoomPlan's `CapturedRoom` into RoomFlow's own model.
/// The rest of the app works with `RoomModel` and never depends on RoomPlan types.
enum RoomPlanConverter {
    static func convert(_ room: CapturedRoom, capturedAt: Date = Date()) -> RoomModel {
        var elements: [CaptureElement] = []

        for wall in room.walls {
            elements.append(surfaceElement(wall, kind: .wall))
        }
        for door in room.doors {
            var element = surfaceElement(door, kind: .door)
            if case .door(let isOpen) = door.category {
                element.isOpen = isOpen
            }
            elements.append(element)
        }
        for window in room.windows {
            elements.append(surfaceElement(window, kind: .window))
        }
        for opening in room.openings {
            elements.append(surfaceElement(opening, kind: .opening))
        }
        for object in room.objects {
            elements.append(CaptureElement(
                kind: .object,
                sourceId: object.identifier,
                category: String(describing: object.category),
                transform: object.transform,
                dimensions: object.dimensions,
                confidence: confidenceName(object.confidence)
            ))
        }

        return RoomNormalizer.makeRoom(from: elements, id: room.identifier, capturedAt: capturedAt)
    }

    private static func surfaceElement(_ surface: CapturedRoom.Surface, kind: CaptureElement.Kind) -> CaptureElement {
        CaptureElement(
            kind: kind,
            sourceId: surface.identifier,
            parentId: surface.parentIdentifier,
            transform: surface.transform,
            dimensions: surface.dimensions,
            confidence: confidenceName(surface.confidence)
        )
    }

    private static func confidenceName(_ confidence: CapturedRoom.Confidence) -> String {
        switch confidence {
        case .high: "high"
        case .medium: "medium"
        case .low: "low"
        @unknown default: "unknown"
        }
    }
}

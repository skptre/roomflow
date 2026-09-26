import Foundation
import simd

/// One scanned element reduced to what the normalizer needs.
/// Keeps the geometry math free of RoomPlan so it can be tested without a LiDAR scan.
nonisolated struct CaptureElement {
    enum Kind { case wall, door, window, opening, object }

    var kind: Kind
    var sourceId: UUID
    /// For doors/windows/openings: the wall they belong to.
    var parentId: UUID? = nil
    /// Object category name ("bed", "sofa", …). Ignored for surfaces.
    var category: String = ""
    /// Pose of the element's center in RoomPlan's world frame.
    var transform: simd_float4x4
    /// Surfaces: x = length along the surface, y = height. Objects: width, height, depth.
    var dimensions: SIMD3<Float>
    var confidence: String = "high"
    var isOpen: Bool? = nil
    var color: EstimatedColor? = nil
}

/// Converts scanned elements from RoomPlan's world frame into RoomFlow's room frame.
///
/// RoomPlan's world frame is right-handed, Y-up, in meters, with its origin wherever the
/// phone was when scanning started, so the floor sits at an arbitrary negative y and the
/// walls at an arbitrary angle. This rotates the room so its longest wall runs along X,
/// puts the floor at y = 0, and shifts the walls' bounding box to start at (0, 0).
nonisolated enum RoomNormalizer {
    static func makeRoom(from elements: [CaptureElement], floorColor: EstimatedColor? = nil, id: UUID = UUID(), capturedAt: Date = Date()) -> RoomModel {
        let walls = elements.filter { $0.kind == .wall }
        let objects = elements.filter { $0.kind == .object }

        // 1. Rotation: undo the longest wall's yaw so it lies along +X.
        let referenceYaw = walls.max { $0.dimensions.x < $1.dimensions.x }.map { yaw(of: $0.transform) } ?? 0
        let alignment = simd_quatf(angle: -referenceYaw, axis: SIMD3<Float>(0, 1, 0))

        // 2. Floor height: bottom of the walls (or of the objects if no walls were found).
        let floorY = walls.map { center(of: $0).y - $0.dimensions.y / 2 }.min()
            ?? objects.map { center(of: $0).y - $0.dimensions.y / 2 }.min()
            ?? 0

        // 3. Horizontal extent of the rotated wall endpoints.
        var outline = walls.flatMap(endpoints(of:)).map { alignment.act($0) }
        if outline.isEmpty {
            outline = objects.flatMap(footprintCorners(of:)).map { alignment.act($0) }
        }
        let minX = outline.map(\.x).min() ?? 0
        let maxX = outline.map(\.x).max() ?? 0
        let minZ = outline.map(\.z).min() ?? 0
        let maxZ = outline.map(\.z).max() ?? 0
        let offset = SIMD3<Float>(minX, floorY, minZ)

        func toRoom(_ point: SIMD3<Float>) -> SIMD3<Float> {
            alignment.act(point) - offset
        }

        // Readable IDs ("wall-1", "bed-2") in RoomPlan's order; stable for the editing session.
        var counters: [String: Int] = [:]
        func nextId(_ prefix: String) -> String {
            counters[prefix, default: 0] += 1
            return "\(prefix)-\(counters[prefix]!)"
        }

        var wallIds: [UUID: String] = [:]
        let roomWalls: [Wall] = walls.map { wall in
            let ends = endpoints(of: wall).map(toRoom)
            let wallId = nextId("wall")
            wallIds[wall.sourceId] = wallId
            return Wall(
                id: wallId,
                start: floorPoint(ends[0]),
                end: floorPoint(ends[1]),
                height: meters(wall.dimensions.y),
                sourceId: wall.sourceId,
                estimatedColor: wall.color
            )
        }

        func makeOpenings(_ kind: CaptureElement.Kind, prefix: String) -> [WallOpening] {
            elements.filter { $0.kind == kind }.map { surface in
                let ends = endpoints(of: surface).map(toRoom)
                let bottom = toRoom(center(of: surface)).y - surface.dimensions.y / 2
                return WallOpening(
                    id: nextId(prefix),
                    wallId: surface.parentId.flatMap { wallIds[$0] },
                    start: floorPoint(ends[0]),
                    end: floorPoint(ends[1]),
                    bottomY: meters(max(bottom, 0)),
                    height: meters(surface.dimensions.y),
                    isOpen: surface.isOpen,
                    sourceId: surface.sourceId
                )
            }
        }

        let roomObjects: [RoomObject] = objects.map { object in
            let base = toRoom(center(of: object)) - SIMD3<Float>(0, object.dimensions.y / 2, 0)
            return RoomObject(
                id: nextId(object.category),
                category: object.category,
                position: Vector3(x: meters(base.x), y: meters(max(base.y, 0)), z: meters(base.z)),
                dimensions: ObjectDimensions(
                    width: meters(object.dimensions.x),
                    height: meters(object.dimensions.y),
                    depth: meters(object.dimensions.z)
                ),
                yawDegrees: normalizedDegrees(yaw(of: object.transform) - referenceYaw),
                movable: RoomObject.isMovable(category: object.category),
                source: "roomplan",
                confidence: object.confidence,
                sourceId: object.sourceId,
                estimatedColor: object.color
            )
        }

        let height = walls.map(\.dimensions.y).max()
            ?? objects.map { center(of: $0).y + $0.dimensions.y / 2 - floorY }.max()
            ?? 0

        return RoomModel(
            id: id,
            dimensions: RoomDimensions(width: meters(maxX - minX), length: meters(maxZ - minZ), height: meters(height)),
            walls: roomWalls,
            doors: makeOpenings(.door, prefix: "door"),
            windows: makeOpenings(.window, prefix: "window"),
            openings: makeOpenings(.opening, prefix: "opening"),
            objects: roomObjects,
            capture: CaptureAlignment(
                capturedAt: capturedAt,
                alignmentYawDegrees: normalizedDegrees(referenceYaw),
                alignmentOffset: Vector3(x: meters(offset.x), y: meters(offset.y), z: meters(offset.z))
            ),
            floorColor: floorColor
        )
    }

    // MARK: - Geometry helpers

    /// Rotation about +Y, in radians. A yaw of θ turns local +X into (cos θ, 0, -sin θ),
    /// which is counterclockwise when viewed from above.
    static func yaw(of transform: simd_float4x4) -> Float {
        let xAxis = transform.columns.0
        return atan2(-xAxis.z, xAxis.x)
    }

    private static func center(of element: CaptureElement) -> SIMD3<Float> {
        let c = element.transform.columns.3
        return SIMD3<Float>(c.x, c.y, c.z)
    }

    /// The two ends of a wall/door/window: center ± local X axis × half its length.
    private static func endpoints(of element: CaptureElement) -> [SIMD3<Float>] {
        let axis = element.transform.columns.0
        let along = SIMD3<Float>(axis.x, axis.y, axis.z) * (element.dimensions.x / 2)
        let c = center(of: element)
        return [c - along, c + along]
    }

    private static func footprintCorners(of element: CaptureElement) -> [SIMD3<Float>] {
        let x = element.transform.columns.0, z = element.transform.columns.2
        let halfWidth = SIMD3<Float>(x.x, x.y, x.z) * (element.dimensions.x / 2)
        let halfDepth = SIMD3<Float>(z.x, z.y, z.z) * (element.dimensions.z / 2)
        let c = center(of: element)
        return [c - halfWidth - halfDepth, c + halfWidth - halfDepth, c + halfWidth + halfDepth, c - halfWidth + halfDepth]
    }

    private static func floorPoint(_ point: SIMD3<Float>) -> FloorPoint {
        FloorPoint(x: meters(point.x), z: meters(point.z))
    }

    /// Rounds to the millimeter so JSON shows 4.2, not 4.199999809265137.
    private static func meters(_ value: Float) -> Double {
        (Double(value) * 1000).rounded() / 1000
    }

    /// Radians → degrees in 0..<360, rounded to 0.1°.
    private static func normalizedDegrees(_ radians: Float) -> Double {
        var degrees = (Double(radians) * 180 / .pi * 10).rounded() / 10
        degrees = degrees.truncatingRemainder(dividingBy: 360)
        if degrees < 0 { degrees += 360 }
        return degrees == 360 || degrees == 0 ? 0 : degrees
    }
}

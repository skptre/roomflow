import CoreGraphics
import Foundation

/// Maps between room meters (x, z) and view points for the top-down plan.
/// The whole room is scaled to fit the view, centered, with padding.
nonisolated struct FloorPlanTransform {
    /// View points per meter.
    let scale: Double
    /// View position of the room origin (x: 0, z: 0).
    let offset: CGPoint

    init(room: RoomDimensions, viewSize: CGSize, padding: Double = 24) {
        let width = max(room.width, 0.1), length = max(room.length, 0.1)
        let availableWidth = max(Double(viewSize.width) - 2 * padding, 1)
        let availableHeight = max(Double(viewSize.height) - 2 * padding, 1)
        scale = min(availableWidth / width, availableHeight / length)
        offset = CGPoint(x: (Double(viewSize.width) - width * scale) / 2,
                         y: (Double(viewSize.height) - length * scale) / 2)
    }

    func toView(_ point: FloorPoint) -> CGPoint {
        CGPoint(x: offset.x + point.x * scale, y: offset.y + point.z * scale)
    }

    func toRoom(_ point: CGPoint) -> FloorPoint {
        FloorPoint(x: (point.x - offset.x) / scale, z: (point.y - offset.y) / scale)
    }
}

nonisolated enum FloorPlanGeometry {
    /// Floor-plan directions of an object's width (local X) and depth (local Z) axes.
    /// Matches RoomModel's yaw convention: counterclockwise seen from above, +Z pointing down the screen.
    static func axes(yawDegrees: Double) -> (width: FloorPoint, depth: FloorPoint) {
        let angle = yawDegrees * .pi / 180
        return (FloorPoint(x: cos(angle), z: -sin(angle)), FloorPoint(x: sin(angle), z: cos(angle)))
    }

    /// The four corners of an object's footprint, in order around the rectangle.
    static func footprint(of object: RoomObject) -> [FloorPoint] {
        let (u, v) = axes(yawDegrees: object.yawDegrees)
        let hw = object.dimensions.width / 2, hd = object.dimensions.depth / 2
        let c = object.position
        return [(-1.0, -1.0), (1, -1), (1, 1), (-1, 1)].map { a, b in
            FloorPoint(x: c.x + u.x * hw * a + v.x * hd * b, z: c.z + u.z * hw * a + v.z * hd * b)
        }
    }

    /// Whether a floor point lies inside the object's footprint, grown by `margin` meters.
    static func contains(_ point: FloorPoint, in object: RoomObject, margin: Double = 0) -> Bool {
        let (u, v) = axes(yawDegrees: object.yawDegrees)
        let dx = point.x - object.position.x, dz = point.z - object.position.z
        let alongWidth = dx * u.x + dz * u.z
        let alongDepth = dx * v.x + dz * v.z
        return abs(alongWidth) <= object.dimensions.width / 2 + margin
            && abs(alongDepth) <= object.dimensions.depth / 2 + margin
    }

    /// The object under a tap. When footprints overlap (a chair tucked under a table),
    /// the smallest one wins, since the larger one can still be tapped elsewhere.
    static func object(at point: FloorPoint, in objects: [RoomObject], margin: Double = 0) -> RoomObject? {
        objects
            .filter { contains(point, in: $0, margin: margin) }
            .min { $0.dimensions.width * $0.dimensions.depth < $1.dimensions.width * $1.dimensions.depth }
    }

    /// Chains wall segments end to end into a closed floor outline.
    /// Returns nil when the walls don't form one closed loop (e.g. a partial scan).
    static func outline(of walls: [Wall], tolerance: Double = 0.05) -> [FloorPoint]? {
        guard let first = walls.first, walls.count >= 3 else { return nil }
        func near(_ a: FloorPoint, _ b: FloorPoint) -> Bool { hypot(a.x - b.x, a.z - b.z) <= tolerance }

        var remaining = Array(walls.dropFirst())
        var points = [first.start, first.end]
        while !remaining.isEmpty {
            let tail = points[points.count - 1]
            guard let index = remaining.firstIndex(where: { near($0.start, tail) || near($0.end, tail) }) else { return nil }
            let wall = remaining.remove(at: index)
            points.append(near(wall.start, tail) ? wall.end : wall.start)
        }
        guard near(points[points.count - 1], points[0]) else { return nil }
        points.removeLast()
        return points
    }
}

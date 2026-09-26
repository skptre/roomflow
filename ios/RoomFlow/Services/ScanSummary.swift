import Foundation
import RoomPlan
import simd

/// Human-readable facts about a finished scan, for the Milestone 1 results screen.
///
/// Temporary: the RoomModel converter (Milestone 2) replaces this as the app's
/// source of truth. All values are meters in RoomPlan's world frame
/// (right-handed, Y-up, origin where the scan started).
struct ScanSummary {
    struct ObjectLine: Identifiable {
        let id: UUID
        let category: String
        let width: Float
        let height: Float
        let depth: Float
    }

    let wallCount: Int
    let doorCount: Int
    let windowCount: Int
    let openingCount: Int
    let objects: [ObjectLine]

    /// Extent of all wall endpoints along world X and Z.
    /// Overestimates the room when it sits at an angle to the scan's starting direction.
    let footprintX: Float?
    let footprintZ: Float?
    let wallHeight: Float?

    init(room: CapturedRoom) {
        wallCount = room.walls.count
        doorCount = room.doors.count
        windowCount = room.windows.count
        openingCount = room.openings.count

        objects = room.objects.map { object in
            ObjectLine(
                id: object.identifier,
                category: String(describing: object.category),
                width: object.dimensions.x,
                height: object.dimensions.y,
                depth: object.dimensions.z
            )
        }

        // A wall's transform sits at its center; its local X axis runs along the wall
        // and dimensions.x is its length, so the two ends are center ± axisX * length / 2.
        let endpoints: [SIMD3<Float>] = room.walls.flatMap { wall -> [SIMD3<Float>] in
            let center = SIMD3<Float>(wall.transform.columns.3.x, wall.transform.columns.3.y, wall.transform.columns.3.z)
            let alongWall = SIMD3<Float>(wall.transform.columns.0.x, wall.transform.columns.0.y, wall.transform.columns.0.z)
            let halfLength = wall.dimensions.x / 2
            return [center - alongWall * halfLength, center + alongWall * halfLength]
        }

        if let minX = endpoints.map(\.x).min(), let maxX = endpoints.map(\.x).max(),
           let minZ = endpoints.map(\.z).min(), let maxZ = endpoints.map(\.z).max() {
            footprintX = maxX - minX
            footprintZ = maxZ - minZ
        } else {
            footprintX = nil
            footprintZ = nil
        }
        wallHeight = room.walls.map(\.dimensions.y).max()
    }

    var logDescription: String {
        var lines = ["[RoomFlow] Scan finished"]
        if let footprintX, let footprintZ {
            lines.append(String(format: "  footprint ≈ %.2f m × %.2f m", footprintX, footprintZ))
        }
        if let wallHeight {
            lines.append(String(format: "  wall height ≈ %.2f m", wallHeight))
        }
        lines.append("  walls \(wallCount), doors \(doorCount), windows \(windowCount), openings \(openingCount)")
        for object in objects {
            lines.append(String(format: "  %@ %.2f × %.2f × %.2f m (w×h×d)", object.category, object.width, object.height, object.depth))
        }
        return lines.joined(separator: "\n")
    }
}

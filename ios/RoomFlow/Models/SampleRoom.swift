#if DEBUG
import Foundation
import simd

/// A synthetic 4.2 × 3.8 m bedroom for testing without LiDAR (Simulator, UI work).
/// Built through RoomNormalizer from a fake scan that is rotated and offset like a real one.
/// Not a real scan: screens showing it must say so.
nonisolated enum SampleRoom {
    static func make() -> RoomModel {
        let width: Float = 4.2, length: Float = 3.8, height: Float = 2.7
        let north = UUID(), east = UUID(), south = UUID(), west = UUID()

        // Pretend the scan started 1.4 m above the floor, facing 30° off the walls.
        func pose(_ x: Float, _ y: Float, _ z: Float, yawDegrees: Float) -> simd_float4x4 {
            let scanYaw: Float = 30 * .pi / 180
            let scanOrigin = SIMD3<Float>(1.5, -1.4, -2.0)
            var m = simd_float4x4(simd_quatf(angle: scanYaw + yawDegrees * .pi / 180, axis: [0, 1, 0]))
            let p = simd_quatf(angle: scanYaw, axis: [0, 1, 0]).act([x, y, z]) + scanOrigin
            m.columns.3 = SIMD4<Float>(p.x, p.y, p.z, 1)
            return m
        }

        let elements: [CaptureElement] = [
            .init(kind: .wall, sourceId: north, transform: pose(width / 2, height / 2, 0, yawDegrees: 0), dimensions: [width, height, 0]),
            .init(kind: .wall, sourceId: east, transform: pose(width, height / 2, length / 2, yawDegrees: 90), dimensions: [length, height, 0]),
            .init(kind: .wall, sourceId: south, transform: pose(width / 2, height / 2, length, yawDegrees: 0), dimensions: [width, height, 0]),
            .init(kind: .wall, sourceId: west, transform: pose(0, height / 2, length / 2, yawDegrees: 90), dimensions: [length, height, 0]),
            .init(kind: .door, sourceId: UUID(), parentId: north, transform: pose(3.5, 1.0, 0, yawDegrees: 0), dimensions: [0.9, 2.0, 0], isOpen: true),
            .init(kind: .window, sourceId: UUID(), parentId: south, transform: pose(2.0, 1.5, length, yawDegrees: 0), dimensions: [1.2, 1.0, 0]),
            .init(kind: .object, sourceId: UUID(), category: "bed", transform: pose(1.2, 0.3, 1.5, yawDegrees: 90), dimensions: [1.5, 0.6, 2.0]),
            .init(kind: .object, sourceId: UUID(), category: "storage", transform: pose(3.7, 0.45, 3.5, yawDegrees: 0), dimensions: [0.9, 0.9, 0.5]),
            .init(kind: .object, sourceId: UUID(), category: "table", transform: pose(3.6, 0.375, 1.6, yawDegrees: 90), dimensions: [1.2, 0.75, 0.6]),
            .init(kind: .object, sourceId: UUID(), category: "chair", transform: pose(3.0, 0.45, 1.6, yawDegrees: 270), dimensions: [0.5, 0.9, 0.5]),
        ]
        return RoomNormalizer.makeRoom(from: elements)
    }
}
#endif

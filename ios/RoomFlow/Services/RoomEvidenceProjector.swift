import CoreGraphics
import Foundation
import RoomPlan
import simd

/// A measured box to project: RoomPlan's object pose (center) and dimensions (width, height, depth).
nonisolated struct ProjectableObject: Sendable {
    var sourceId: UUID
    var transform: simd_float4x4
    var dimensions: SIMD3<Float>
}

/// Normalized image rectangle, top-left origin, 0...1 on each axis.
nonisolated struct NormalizedRect: Equatable, Sendable {
    var x: Double, y: Double, width: Double, height: Double
    var midX: Double { x + width / 2 }
    var midY: Double { y + height / 2 }
    var maxX: Double { x + width }
    var maxY: Double { y + height }
    var array: [Double] { [x, y, width, height] }
}

/// Maps final captured objects into reference photos.
///
/// Uses the same frame as the photos (ARKit/RoomPlan native world, camera looking down -Z,
/// sensor-orientation pixels), so screen rotation never enters the math.
nonisolated enum RoomEvidenceProjector {
    /// Boxes with any corner closer than this (or behind the camera) are rejected in v1.
    static let nearPlane: Float = 0.1

    /// The image region covered by a box's projected corners, clipped to the image;
    /// nil when the box crosses the near plane, lies outside the image, or input isn't finite.
    static func projectedBounds(boxTransform: simd_float4x4, dimensions: SIMD3<Float>,
                                cameraToWorld: simd_float4x4, intrinsics: simd_float3x3,
                                pixelWidth: Int, pixelHeight: Int) -> NormalizedRect? {
        guard pixelWidth > 0, pixelHeight > 0,
              isFinite(boxTransform), isFinite(cameraToWorld), isFinite(intrinsics),
              dimensions.x.isFinite, dimensions.y.isFinite, dimensions.z.isFinite
        else { return nil }

        let worldToCamera = cameraToWorld.inverse
        let half = dimensions / 2
        var minU = Float.infinity, maxU = -Float.infinity, minV = Float.infinity, maxV = -Float.infinity
        for sx in [-1, 1] as [Float] {
            for sy in [-1, 1] as [Float] {
                for sz in [-1, 1] as [Float] {
                    let corner = boxTransform * SIMD4<Float>(sx * half.x, sy * half.y, sz * half.z, 1)
                    let p = worldToCamera * corner
                    let depth = -p.z
                    guard depth > nearPlane else { return nil }
                    // Camera +X → image right, camera +Y → image up (v grows downward).
                    let u = intrinsics[0][0] * p.x / depth + intrinsics[2][0]
                    let v = intrinsics[2][1] - intrinsics[1][1] * p.y / depth
                    minU = min(minU, u); maxU = max(maxU, u)
                    minV = min(minV, v); maxV = max(maxV, v)
                }
            }
        }

        let w = Float(pixelWidth), h = Float(pixelHeight)
        let left = max(minU, 0), right = min(maxU, w)
        let top = max(minV, 0), bottom = min(maxV, h)
        guard right > left, bottom > top else { return nil }
        return NormalizedRect(x: Double(left / w), y: Double(top / h),
                              width: Double((right - left) / w), height: Double((bottom - top) / h))
    }

    /// Candidate regions for every object in every reliable photo. An object may appear in several
    /// photos. Photos taken before a tracking interruption are skipped: their pose may not match the room.
    static func associate(objects: [ProjectableObject], photos: [RoomPhotoEvidence]) -> [RoomPhotoAssociation] {
        photos.filter(\.trackingContinuous).flatMap { photo -> [RoomPhotoAssociation] in
            guard let camera = matrix4(photo.cameraToWorld), let intrinsics = matrix3(photo.intrinsics) else { return [] }
            return objects.compactMap { object in
                projectedBounds(boxTransform: object.transform, dimensions: object.dimensions,
                                cameraToWorld: camera, intrinsics: intrinsics,
                                pixelWidth: photo.pixelWidth, pixelHeight: photo.pixelHeight)
                    .map { RoomPhotoAssociation(sourceId: object.sourceId, photoId: photo.id, rect: $0.array) }
            }
        }
    }

    // MARK: - Helpers

    private static func matrix4(_ values: [Float]) -> simd_float4x4? {
        guard values.count == 16 else { return nil }
        return simd_float4x4(columns: (SIMD4(values[0...3]), SIMD4(values[4...7]), SIMD4(values[8...11]), SIMD4(values[12...15])))
    }

    private static func matrix3(_ values: [Float]) -> simd_float3x3? {
        guard values.count == 9 else { return nil }
        return simd_float3x3(columns: (SIMD3(values[0...2]), SIMD3(values[3...5]), SIMD3(values[6...8])))
    }

    private static func isFinite(_ m: simd_float4x4) -> Bool {
        [m.columns.0, m.columns.1, m.columns.2, m.columns.3].allSatisfy { $0.x.isFinite && $0.y.isFinite && $0.z.isFinite && $0.w.isFinite }
    }

    private static func isFinite(_ m: simd_float3x3) -> Bool {
        [m.columns.0, m.columns.1, m.columns.2].allSatisfy { $0.x.isFinite && $0.y.isFinite && $0.z.isFinite }
    }
}

extension RoomEvidenceProjector {
    /// Associates photos with the final processed room's objects (never an intermediate update).
    static func associate(room: CapturedRoom, photos: [RoomPhotoEvidence]) -> [RoomPhotoAssociation] {
        associate(objects: room.objects.map {
            ProjectableObject(sourceId: $0.identifier, transform: $0.transform, dimensions: $0.dimensions)
        }, photos: photos)
    }

    /// Appearance evidence for a finished scan: sampled colors (approximate) plus photo regions.
    static func appearance(room: CapturedRoom, colors: RoomColorEstimates, photos: [RoomPhotoEvidence]) -> RoomAppearanceEvidence {
        RoomAppearanceEvidence(
            captureId: room.identifier,
            colors: colors.byElement
                .map { SourceColor(sourceId: $0.key, hex: $0.value.hex, sampleCount: $0.value.sampleCount) }
                .sorted { $0.sourceId.uuidString < $1.sourceId.uuidString },
            floorColor: colors.floor,
            associations: associate(room: room, photos: photos)
        )
    }
}

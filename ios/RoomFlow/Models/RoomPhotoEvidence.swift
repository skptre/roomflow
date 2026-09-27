import Foundation
import simd

/// A reference photo taken during the scan, with the calibration needed to relate its pixels
/// to the RoomPlan capture. Photos are appearance evidence only: they never change geometry.
nonisolated struct RoomPhotoEvidence: Codable, Equatable, Identifiable, Sendable {
    var id: UUID
    /// The scan session that took it; photos from another session are never attached.
    var sessionID: UUID
    /// ARFrame timestamp, seconds.
    var timestamp: TimeInterval
    var pixelWidth: Int
    var pixelHeight: Int
    /// Camera-to-world transform in RoomPlan's native world frame, 16 numbers, column-major.
    var cameraToWorld: [Float]
    /// Pinhole intrinsics for exactly these pixels (already scaled for the resize), 9 numbers, column-major.
    var intrinsics: [Float]
    /// Pixels are in the camera sensor's native (landscape) orientation, top-left origin, never rotated.
    var pixelOrientation = "sensor-native"
    /// False when AR tracking was interrupted after this photo was taken; its pose may then not
    /// line up with the final room, so automatic object matching must not use it.
    var trackingContinuous: Bool
    var byteCount: Int
    /// Live object this photo was deliberately taken of (focused shot), else nil. Local only: not in the
    /// package manifest; the final photo↔object association always comes from the processed room.
    var focusObjectId: UUID? = nil
    /// Where the JPEG currently lives (temporary folder or saved room). Not part of the JSON.
    var fileURL: URL? = nil

    var fileName: String { "\(id.uuidString).jpg" }

    enum CodingKeys: String, CodingKey {
        case id, sessionID, timestamp, pixelWidth, pixelHeight, cameraToWorld, intrinsics
        case pixelOrientation, trackingContinuous, byteCount, focusObjectId
    }

    static func columnMajor(_ m: simd_float4x4) -> [Float] {
        [m.columns.0, m.columns.1, m.columns.2, m.columns.3].flatMap { [$0.x, $0.y, $0.z, $0.w] }
    }

    static func columnMajor(_ m: simd_float3x3) -> [Float] {
        [m.columns.0, m.columns.1, m.columns.2].flatMap { [$0.x, $0.y, $0.z] }
    }
}

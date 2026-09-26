import Foundation
import Testing
import simd
@testable import RoomFlow

/// Camera at the origin looking down -Z (ARKit convention); 1280×960 sensor-orientation pixels.
struct RoomEvidenceProjectorTests {
    private let camera = matrix_identity_float4x4
    private let intrinsics = simd_float3x3(columns: ([1000, 0, 0], [0, 1000, 0], [640, 480, 1]))

    private func box(at center: SIMD3<Float>, yawDegrees: Float = 0) -> simd_float4x4 {
        var m = simd_float4x4(simd_quatf(angle: yawDegrees * .pi / 180, axis: [0, 1, 0]))
        m.columns.3 = SIMD4<Float>(center, 1)
        return m
    }

    private func project(_ transform: simd_float4x4, size: SIMD3<Float> = [0.2, 0.2, 0.2],
                         camera: simd_float4x4? = nil, width: Int = 1280, height: Int = 960) -> NormalizedRect? {
        RoomEvidenceProjector.projectedBounds(boxTransform: transform, dimensions: size,
                                              cameraToWorld: camera ?? self.camera, intrinsics: intrinsics,
                                              pixelWidth: width, pixelHeight: height)
    }

    @Test func boxAheadProjectsToImageCenter() throws {
        let rect = try #require(project(box(at: [0, 0, -2])))
        #expect(abs(rect.midX - 0.5) < 0.001)
        #expect(abs(rect.midY - 0.5) < 0.001)
        // 0.2 m at ~2 m with f = 1000 px ≈ 100 px wide on a 1280 px image.
        #expect(rect.width > 0.07 && rect.width < 0.10)
    }

    @Test func rotatedBoxCoversAllCorners() throws {
        let straight = try #require(project(box(at: [0, 0, -3]), size: [1, 0.2, 0.2]))
        let turned = try #require(project(box(at: [0, 0, -3], yawDegrees: 45), size: [1, 0.2, 0.2]))
        // Turning a long box toward the camera narrows it on screen but it still spans its corners.
        #expect(turned.width < straight.width)
        #expect(turned.width > 0.1)
    }

    @Test func nonSquareImageNormalizesEachAxisSeparately() throws {
        let rect = try #require(project(box(at: [0, 0, -2]), size: [0.2, 0.2, 0]))
        // Same pixel size in both directions → normalized height is larger on a 1280×960 image.
        #expect(abs(rect.height / rect.width - 1280.0 / 960.0) < 0.01)
    }

    @Test func boxBehindCameraIsRejected() {
        #expect(project(box(at: [0, 0, 2])) == nil)
    }

    @Test func boxCrossingTheNearPlaneIsRejected() {
        // Straddles the camera: some corners in front, some behind.
        #expect(project(box(at: [0, 0, 0]), size: [1, 1, 1]) == nil)
    }

    @Test func partlyVisibleBoxIsClippedToTheImageEdge() throws {
        // Centered right at the image's right edge (u = 1280 at 2 m → x = 1.28 m).
        let rect = try #require(project(box(at: [1.28, 0, -2])))
        #expect(abs(rect.maxX - 1) < 0.0001)
        #expect(rect.width > 0 && rect.width < 0.1)
    }

    @Test func boxFullyOutsideTheImageIsRejected() {
        #expect(project(box(at: [5, 0, -2])) == nil)
    }

    @Test func nonFiniteInputIsRejected() {
        var bad = box(at: [0, 0, -2])
        bad.columns.3.x = .nan
        #expect(project(bad) == nil)
        #expect(project(box(at: [0, 0, -2]), size: [.infinity, 0.2, 0.2]) == nil)
    }

    @Test func imageDirectionsFollowTheCameraNotTheScreen() throws {
        // Camera +X is image right and camera +Y is image up, whatever way the phone's UI was rotated.
        let right = try #require(project(box(at: [0.5, 0, -2])))
        let up = try #require(project(box(at: [0, 0.5, -2])))
        #expect(right.midX > 0.5)
        #expect(up.midY < 0.5)
    }

    @Test func associationsKeepSourceIDsAndSkipUncertainPhotos() {
        let chair = ProjectableObject(sourceId: UUID(), transform: box(at: [0, 0, -2]), dimensions: [0.5, 0.9, 0.5])
        let hidden = ProjectableObject(sourceId: UUID(), transform: box(at: [0, 0, 3]), dimensions: [1, 1, 1])
        func photo(continuous: Bool) -> RoomPhotoEvidence {
            RoomPhotoEvidence(id: UUID(), sessionID: UUID(), timestamp: 0, pixelWidth: 1280, pixelHeight: 960,
                              cameraToWorld: RoomPhotoEvidence.columnMajor(camera),
                              intrinsics: RoomPhotoEvidence.columnMajor(intrinsics),
                              trackingContinuous: continuous, byteCount: 1)
        }
        let a = photo(continuous: true), b = photo(continuous: true), uncertain = photo(continuous: false)

        let links = RoomEvidenceProjector.associate(objects: [chair, hidden], photos: [a, b, uncertain])

        #expect(links.count == 2) // the chair in both reliable photos; nothing behind the camera
        #expect(links.allSatisfy { $0.sourceId == chair.sourceId && $0.method == "projected-bounds" })
        #expect(Set(links.map(\.photoId)) == [a.id, b.id])
        #expect(links.allSatisfy { $0.rect.count == 4 && $0.rect.allSatisfy { (0...1).contains($0) } })
    }
}

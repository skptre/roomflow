import CoreGraphics
import Foundation
import Testing
import simd
@testable import RoomFlow

/// Writes fixed-size fake JPEGs; can fail, or block until released to simulate a slow encode.
nonisolated private final class FakeEncoder: PhotoEncoding, @unchecked Sendable {
    let bytesPerPhoto: Int
    let fails: Bool
    let gate: DispatchSemaphore?

    init(bytesPerPhoto: Int = 1_000, fails: Bool = false, gate: DispatchSemaphore? = nil) {
        self.bytesPerPhoto = bytesPerPhoto
        self.fails = fails
        self.gate = gate
    }

    func writeJPEG(_ image: CGImage, quality: Double, to url: URL) throws -> Int {
        gate?.wait()
        if fails { throw CocoaError(.fileWriteUnknown) }
        try Data(count: bytesPerPhoto).write(to: url)
        return bytesPerPhoto
    }
}

struct RoomEvidenceRecorderTests {
    private func makeRoot() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("RoomEvidenceRecorderTests-\(UUID())")
    }

    /// A 64×48 image standing in for a downscaled 1920×1440 camera frame.
    private func image() -> CGImage {
        let context = CGContext(data: nil, width: 64, height: 48, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpaceCreateDeviceRGB(),
                                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        return context.makeImage()!
    }

    /// Camera `x` meters along +X, `time` seconds into the scan.
    private func frame(time: TimeInterval, x: Float, tracking: Bool = true) -> PhotoFrameSnapshot {
        var pose = matrix_identity_float4x4
        pose.columns.3 = SIMD4<Float>(x, 1.4, 0, 1)
        let intrinsics = simd_float3x3(columns: ([1500, 0, 0], [0, 1500, 0], [960, 720, 1]))
        return PhotoFrameSnapshot(timestamp: time, cameraToWorld: pose, intrinsics: intrinsics,
                                  imageWidth: 1920, imageHeight: 1440, trackingNormal: tracking)
    }

    @Test func limitsCandidateCountAndBytes() async throws {
        let root = makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        var policy = PhotoCandidatePolicy()
        policy.maxTotalBytes = 10_000 // room for 10 fake 1 000-byte photos, fewer than maxPhotos (12)
        let recorder = RoomEvidenceRecorder(policy: policy, encoder: FakeEncoder(), rootDirectory: root)
        let session = UUID()
        recorder.start(sessionID: session)

        for i in 0..<40 {
            recorder.consider(snapshot: frame(time: Double(i), x: Float(i) * 0.5), sessionID: session) { image() }
            await recorder.waitUntilIdle()
        }
        let photos = try await recorder.finish(sessionID: session)

        #expect(photos.count == 10)
        #expect(photos.map(\.byteCount).reduce(0, +) <= 10_000)
        // Spread across the scan rather than only the first frames.
        #expect(photos.last!.timestamp - photos.first!.timestamp > 20)
        // Only the chosen photos remain on disk.
        let files = try FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent(session.uuidString).path)
        #expect(Set(files) == Set(photos.map(\.fileName)))
        // Intrinsics describe the exported 64×48 pixels, not the 1920×1440 sensor image.
        let scale: Float = 64.0 / 1920.0
        #expect(abs(photos[0].intrinsics[0] - 1500 * scale) < 0.001)
        #expect(abs(photos[0].intrinsics[6] - 960 * scale) < 0.001)
        #expect(photos[0].pixelWidth == 64 && photos[0].pixelHeight == 48)
    }

    @Test func dropsFramesWhileEncodingBusy() async throws {
        let root = makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let gate = DispatchSemaphore(value: 0)
        let recorder = RoomEvidenceRecorder(encoder: FakeEncoder(gate: gate), rootDirectory: root)
        let session = UUID()
        recorder.start(sessionID: session)

        recorder.consider(snapshot: frame(time: 0, x: 0), sessionID: session) { image() }
        recorder.consider(snapshot: frame(time: 1, x: 1), sessionID: session) { image() } // busy → dropped
        gate.signal()
        await recorder.waitUntilIdle()

        #expect(try await recorder.finish(sessionID: session).count == 1)
    }

    @Test func cancelRejectsLateCompletion() async throws {
        let root = makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let gate = DispatchSemaphore(value: 0)
        let recorder = RoomEvidenceRecorder(encoder: FakeEncoder(gate: gate), rootDirectory: root)
        let old = UUID()
        recorder.start(sessionID: old)
        recorder.consider(snapshot: frame(time: 0, x: 0), sessionID: old) { image() }

        recorder.cancel(sessionID: old)
        gate.signal() // the encode finishes after cancellation
        await recorder.waitUntilIdle()

        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent(old.uuidString).path))
        let next = UUID()
        recorder.start(sessionID: next)
        #expect(try await recorder.finish(sessionID: next).isEmpty)
        await #expect(throws: RoomEvidenceRecorder.RecorderError.self) {
            try await recorder.finish(sessionID: old)
        }
    }

    @Test func newSessionRejectsOldFrames() async throws {
        let root = makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = RoomEvidenceRecorder(encoder: FakeEncoder(), rootDirectory: root)
        let old = UUID(), current = UUID()
        recorder.start(sessionID: old)
        recorder.start(sessionID: current)

        recorder.consider(snapshot: frame(time: 0, x: 0), sessionID: old) { image() }
        await recorder.waitUntilIdle()
        recorder.consider(snapshot: frame(time: 1, x: 1), sessionID: current) { image() }
        await recorder.waitUntilIdle()

        let photos = try await recorder.finish(sessionID: current)
        #expect(photos.count == 1)
        #expect(photos.allSatisfy { $0.sessionID == current })
    }

    @Test func imageFailureDoesNotFailGeometry() async throws {
        let root = makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = RoomEvidenceRecorder(encoder: FakeEncoder(fails: true), rootDirectory: root)
        let session = UUID()
        recorder.start(sessionID: session)

        for i in 0..<3 {
            recorder.consider(snapshot: frame(time: Double(i), x: Float(i)), sessionID: session) { image() }
            await recorder.waitUntilIdle()
        }
        // No photos, but finishing still succeeds so the scan itself is kept.
        #expect(try await recorder.finish(sessionID: session).isEmpty)
    }

    @Test func trackingInterruptionMarksEarlierPhotosUncertain() async throws {
        let root = makeRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let recorder = RoomEvidenceRecorder(encoder: FakeEncoder(), rootDirectory: root)
        let session = UUID()
        recorder.start(sessionID: session)

        recorder.consider(snapshot: frame(time: 0, x: 0), sessionID: session) { image() }
        await recorder.waitUntilIdle()
        recorder.consider(snapshot: frame(time: 1, x: 1, tracking: false), sessionID: session) { image() }
        recorder.consider(snapshot: frame(time: 2, x: 2), sessionID: session) { image() }
        await recorder.waitUntilIdle()

        let photos = try await recorder.finish(sessionID: session)
        #expect(photos.count == 2)
        #expect(photos[0].trackingContinuous == false)
        #expect(photos[1].trackingContinuous == true)
    }

    @Test func smallMovementsAreNotNewViews() {
        let policy = PhotoCandidatePolicy()
        let start = frame(time: 0, x: 0).cameraToWorld
        #expect(!policy.isNewView(frame(time: 1, x: 0.1).cameraToWorld, since: start))
        #expect(policy.isNewView(frame(time: 1, x: 0.3).cameraToWorld, since: start))
        let turned = simd_float4x4(simd_quatf(angle: 20 * .pi / 180, axis: [0, 1, 0]))
        #expect(policy.isNewView(turned, since: matrix_identity_float4x4))
    }
}

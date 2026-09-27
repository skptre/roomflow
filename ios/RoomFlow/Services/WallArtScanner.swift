import ARKit
import CoreImage
import Foundation
import RoomPlan
import Vision
import simd

/// Reads LiDAR depth out of an ARKit depth map. Shared by `WallArtScanner` and `RoomScanService`'s
/// focus tracking so there is one implementation of the pixel lookup.
nonisolated enum DepthMapReader {
    /// LiDAR depth (meters) at a normalized, top-left-origin image point; nil without a depth map or
    /// for an invalid/zero sample.
    static func depth(in map: CVPixelBuffer?, u: Float, v: Float) -> Float? {
        guard let map else { return nil }
        CVPixelBufferLockBaseAddress(map, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(map, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(map) else { return nil }
        let width = CVPixelBufferGetWidth(map), height = CVPixelBufferGetHeight(map)
        let x = min(width - 1, max(0, Int(u * Float(width))))
        let y = min(height - 1, max(0, Int(v * Float(height))))
        let value = base.advanced(by: y * CVPixelBufferGetBytesPerRow(map)).assumingMemoryBound(to: Float32.self)[x]
        return value.isFinite && value > 0 ? value : nil
    }
}

/// Detects wall art while a room is being scanned: runs `VNDetectRectanglesRequest` on camera frames,
/// judges each rectangle with `WallArtDetector`, tracks sightings across the scan with `WallArtTracker`,
/// and keeps a straight-on reference crop of the best-seen view of each candidate. Finished items are
/// measured estimates (camera + LiDAR); a single sighting is never confirmed.
///
/// `process` is expected to be called from the scan's sampling loop (main actor); Vision and Core Image
/// work run on a private serial queue, one frame at a time.
nonisolated final class WallArtScanner: @unchecked Sendable {
    /// A candidate's best reference crop so far, with the score (`frontality × width × height`, matching
    /// `WallArtTracker`'s own ranking) it was captured at, so the highest-scoring group's crop wins when
    /// groups are merged into one item at `finish`.
    private struct ScoredImage {
        var image: CGImage
        var score: Float
    }

    private let encoder: any PhotoEncoding
    private let queue = DispatchQueue(label: "RoomFlow.WallArtScanner", qos: .utility)
    private let lock = NSLock()
    private var busy = false
    private var tracker = WallArtTracker()
    /// Best crop per tracker group index; at most 16 slots. Existing entries can be replaced by a better
    /// sighting of the same group; when full, the slot of the group with the fewest sightings is evicted for
    /// a group seen at least as often (see `slotDecision`).
    private var bestImages: [Int: ScoredImage] = [:]
    private var directory: URL?
    /// Bumped by `reset`/`discard`; a queued frame started under an older generation drops its results so
    /// a stale sighting never lands in the new scan's tracker.
    private var generation = 0

    init(encoder: any PhotoEncoding = ImageIOPhotoEncoder()) {
        self.encoder = encoder
    }

    /// Starts a fresh scan: clears all tracked sightings and images, and creates `directory` for the
    /// reference crops `finish` will write.
    func reset(directory: URL) {
        lock.lock()
        tracker = WallArtTracker()
        bestImages = [:]
        self.directory = directory
        generation += 1
        busy = false
        lock.unlock()
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// Abandons the current scan (cancel or failure): releases every tracked sighting and held crop, and
    /// makes any frame still being analyzed drop its results. `finish` afterwards returns no items.
    func discard() {
        lock.lock()
        tracker = WallArtTracker()
        bestImages = [:]
        directory = nil
        generation += 1
        busy = false
        lock.unlock()
    }

    /// Analyzes `frame` unless the previous frame is still being analyzed, or tracking isn't normal, or
    /// no live wall has been seen yet. Called from the main actor (the scan's sampling loop); the Vision
    /// and Core Image work itself runs on a private queue.
    @MainActor
    func process(frame: ARFrame, surfaces: [LiveSurface], objects: [LiveObject]) {
        guard frame.camera.trackingState == .normal, surfaces.contains(where: { $0.kind == .wall }) else { return }
        lock.lock()
        if busy { lock.unlock(); return }
        busy = true
        let startGeneration = generation
        lock.unlock()

        nonisolated(unsafe) let image = frame.capturedImage
        nonisolated(unsafe) let depthMap = (frame.sceneDepth ?? frame.smoothedSceneDepth)?.depthMap
        let snapshot = RoomEvidenceRecorder.snapshot(of: frame)

        queue.async { [self] in
            defer { lock.lock(); if generation == startGeneration { busy = false }; lock.unlock() }
            let request = VNDetectRectanglesRequest()
            request.maximumObservations = 8
            request.minimumSize = 0.1
            request.minimumConfidence = 0.7
            request.minimumAspectRatio = 0.2
            request.quadratureTolerance = 30
            do { try VNImageRequestHandler(cvPixelBuffer: image, orientation: .up).perform([request]) } catch { return }
            guard let results = request.results, !results.isEmpty else { return }

            for observation in results {
                // Vision: normalized, bottom-left origin → top-left origin.
                let quad = [observation.topLeft, observation.topRight, observation.bottomRight, observation.bottomLeft]
                    .map { SIMD2<Float>(Float($0.x), 1 - Float($0.y)) }
                let verdict = WallArtDetector.judge(quad: quad, camera: snapshot, surfaces: surfaces, objects: objects,
                                                    depthAt: { u, v in DepthMapReader.depth(in: depthMap, u: u, v: v) })
                guard case .sighting(let sighting) = verdict else { continue }

                lock.lock()
                guard generation == startGeneration else { lock.unlock(); return }
                let (group, isNewBest) = tracker.add(sighting)
                let wanted = isNewBest && slotDecision(for: group) != nil
                lock.unlock()
                guard wanted else { continue }
                // `sighting.quad` is in room order, so the crop comes out upright even in portrait.
                guard let cropped = Self.straightOnCrop(pixelBuffer: image, quad: sighting.quad) else { continue }

                let score = sighting.frontality * sighting.width * sighting.height
                lock.lock()
                if generation == startGeneration, let decision = slotDecision(for: group) {
                    if let evict = decision { bestImages[evict] = nil }
                    bestImages[group] = ScoredImage(image: cropped, score: score)
                }
                lock.unlock()
            }
        }
    }

    /// Whether `group` may store a crop, and which slot to evict for it. Caller holds `lock`. Returns
    /// `.some(nil)` when it already has a slot or one is free; `.some(key)` to evict the slot of the group
    /// with the fewest sightings when all 16 are taken and `group` has at least as many; `nil` otherwise.
    private func slotDecision(for group: Int) -> Int?? {
        if bestImages[group] != nil || bestImages.count < 16 { return .some(nil) }
        guard let weakest = bestImages.keys.min(by: { tracker.sightingCount(group: $0) < tracker.sightingCount(group: $1) }),
              tracker.sightingCount(group: group) >= tracker.sightingCount(group: weakest) else { return nil }
        return .some(weakest)
    }

    /// Number of tracker groups confirmed so far (seen enough, from different-enough spots).
    var confirmedCount: Int {
        lock.lock(); defer { lock.unlock() }
        return tracker.confirmedCount
    }

    /// Drains any in-flight frame, attaches confirmed groups to `finalRoom`'s walls, and writes each
    /// item's best reference crop (highest-scoring group among the ones merged into it) to
    /// `<directory>/<item.id>.jpg`. A write failure — or no crop at all — leaves `photoFileName` nil; it
    /// never fails the scan. All held images are released before returning.
    func finish(finalRoom: CapturedRoom) async -> [WallArtItem] {
        await withCheckedContinuation { continuation in
            queue.async { continuation.resume() }
        }

        let liveWalls = finalRoom.walls.map {
            LiveSurface(sourceId: $0.identifier, kind: .wall, transform: $0.transform, dimensions: $0.dimensions)
        }
        let (results, images, dir): ([(item: WallArtItem, groups: [Int])], [Int: ScoredImage], URL?) = lock.withLock {
            let results = tracker.finalize(walls: liveWalls)
            let images = bestImages
            let dir = directory
            bestImages = [:]
            return (results, images, dir)
        }

        var items: [WallArtItem] = []
        for (item, groups) in results {
            var item = item
            if let dir, let best = groups.compactMap({ images[$0] }).max(by: { $0.score < $1.score }) {
                let fileName = "\(item.id.uuidString).jpg"
                let url = dir.appendingPathComponent(fileName)
                if (try? encoder.writeJPEG(best.image, quality: 0.8, to: url)) != nil {
                    item.photoFileName = fileName
                }
            }
            items.append(item)
        }
        return items
    }

    // MARK: - Reference crop

    private static let context = CIContext()

    /// A straight-on crop of the rectangle `quad` (normalized, top-left-origin image points that become the
    /// crop's top-left, top-right, bottom-right, bottom-left — pass room-ordered points for an upright
    /// crop) from `pixelBuffer`, undoing its perspective with
    /// `CIPerspectiveCorrection`, scaled so its long edge is at most 1024 px. Core Image's origin is
    /// bottom-left, so a normalized top-left-origin point `(u, v)` becomes pixel `(u·W, H − v·H)`.
    private static func straightOnCrop(pixelBuffer: CVPixelBuffer, quad: [SIMD2<Float>]) -> CGImage? {
        guard quad.count == 4, let filter = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
        let width = CGFloat(CVPixelBufferGetWidth(pixelBuffer)), height = CGFloat(CVPixelBufferGetHeight(pixelBuffer))
        let points = quad.map { CGPoint(x: CGFloat($0.x) * width, y: height - CGFloat($0.y) * height) }

        filter.setValue(CIImage(cvPixelBuffer: pixelBuffer), forKey: kCIInputImageKey)
        filter.setValue(CIVector(cgPoint: points[0]), forKey: "inputTopLeft")
        filter.setValue(CIVector(cgPoint: points[1]), forKey: "inputTopRight")
        filter.setValue(CIVector(cgPoint: points[2]), forKey: "inputBottomRight")
        filter.setValue(CIVector(cgPoint: points[3]), forKey: "inputBottomLeft")
        guard let output = filter.outputImage else { return nil }
        let extent = output.extent
        guard extent.origin.x.isFinite, extent.origin.y.isFinite, extent.width.isFinite, extent.height.isFinite,
              !extent.isEmpty else { return nil }

        let longEdge = max(output.extent.width, output.extent.height)
        let scale = min(1, 1024 / longEdge)
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        return context.createCGImage(scaled, from: scaled.extent)
    }
}

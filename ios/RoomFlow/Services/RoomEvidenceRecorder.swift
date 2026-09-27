import ARKit
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import simd

/// Camera pose and calibration of one AR frame, copied out so the ARFrame itself is not kept.
nonisolated struct PhotoFrameSnapshot: Sendable {
    var timestamp: TimeInterval
    var cameraToWorld: simd_float4x4
    /// Intrinsics for the full-resolution sensor image.
    var intrinsics: simd_float3x3
    var imageWidth: Int
    var imageHeight: Int
    var trackingNormal: Bool
}

/// Which frames become reference photos. These are v1 tuning defaults, not a coverage guarantee.
nonisolated struct PhotoCandidatePolicy: Sendable {
    var minimumInterval: TimeInterval = 0.75
    var minimumTranslation: Float = 0.25
    var minimumRotationDegrees: Float = 15
    var maxCandidates = 24
    var maxPhotos = 12
    var maxLongEdge = 1280
    var jpegQuality = 0.8
    var maxTotalBytes = 20 * 1024 * 1024

    /// True once the camera has moved or turned enough since the last kept photo.
    func isNewView(_ pose: simd_float4x4, since last: simd_float4x4?) -> Bool {
        guard let last else { return true }
        let moved = simd_distance(SIMD3(pose.columns.3.x, pose.columns.3.y, pose.columns.3.z),
                                  SIMD3(last.columns.3.x, last.columns.3.y, last.columns.3.z))
        let relative = simd_quatf(last).inverse * simd_quatf(pose)
        let angle = relative.angle > .pi ? 2 * .pi - relative.angle : relative.angle
        return moved >= minimumTranslation || angle * 180 / .pi >= minimumRotationDegrees
    }

    /// Evenly spread pick of `count` items, keeping the first and last.
    private func spread<T>(_ items: [T], count: Int) -> [T] {
        guard items.count > count else { return items }
        guard count > 1 else { return count == 1 ? [items[0]] : [] }
        let step = Double(items.count - 1) / Double(count - 1)
        return (0..<count).map { items[Int((Double($0) * step).rounded())] }
    }

    /// Focused photos grouped by object: each group in capture order, groups in first-seen order.
    private func focusGroups(_ photos: [RoomPhotoEvidence]) -> [[RoomPhotoEvidence]] {
        var order: [UUID] = []
        var groups: [UUID: [RoomPhotoEvidence]] = [:]
        for photo in photos.sorted(by: { $0.timestamp < $1.timestamp }) {
            guard let id = photo.focusObjectId else { continue }
            if groups[id] == nil { order.append(id) }
            groups[id, default: []].append(photo)
        }
        return order.compactMap { groups[$0] }
    }

    /// Keeps at most `maxCandidates`: ambient photos are thinned first (every other one), then the newest
    /// photo of whichever object has the most. Returns the dropped photos so their files can be deleted.
    func thin(_ candidates: [RoomPhotoEvidence]) -> (kept: [RoomPhotoEvidence], dropped: [RoomPhotoEvidence]) {
        var kept = candidates
        var dropped: [RoomPhotoEvidence] = []
        while kept.count > maxCandidates {
            let ambient = kept.filter { $0.focusObjectId == nil }
            let remove: Set<UUID>
            if ambient.count > 1 {
                remove = Set(ambient.enumerated().filter { !$0.offset.isMultiple(of: 2) }.map(\.element.id))
            } else if let busiest = focusGroups(kept).max(by: { $0.count < $1.count }), let newest = busiest.last,
                      busiest.count > 1 || ambient.isEmpty {
                remove = [newest.id]
            } else if let only = ambient.first {
                remove = [only.id]
            } else {
                break
            }
            dropped += kept.filter { remove.contains($0.id) }
            kept.removeAll { remove.contains($0.id) }
        }
        return (kept, dropped)
    }

    /// Up to `maxPhotos`: one focused photo per object first (then a second each, …), the rest ambient
    /// photos spread over the scan; then trimmed to the byte budget, ambient first. Sorted by capture time.
    func selectFinal(_ candidates: [RoomPhotoEvidence]) -> [RoomPhotoEvidence] {
        let groups = focusGroups(candidates)
        var chosen: [RoomPhotoEvidence] = []
        var round = 0
        while chosen.count < maxPhotos, groups.contains(where: { $0.count > round }) {
            for group in groups where group.count > round && chosen.count < maxPhotos {
                chosen.append(group[round])
            }
            round += 1
        }
        let ambient = candidates.filter { $0.focusObjectId == nil }.sorted { $0.timestamp < $1.timestamp }
        chosen += spread(ambient, count: maxPhotos - chosen.count)

        while chosen.map(\.byteCount).reduce(0, +) > maxTotalBytes, !chosen.isEmpty {
            if let largest = chosen.indices.filter({ chosen[$0].focusObjectId == nil })
                .max(by: { chosen[$0].byteCount < chosen[$1].byteCount }) {
                chosen.remove(at: largest)
            } else if let busiest = focusGroups(chosen).max(by: { $0.count < $1.count }),
                      let largest = busiest.max(by: { $0.byteCount < $1.byteCount }) {
                chosen.removeAll { $0.id == largest.id }
            } else {
                break
            }
        }
        return chosen.sorted { $0.timestamp < $1.timestamp }
    }
}

nonisolated protocol PhotoEncoding: Sendable {
    /// Writes `image` as a JPEG to `url` and returns its size in bytes.
    func writeJPEG(_ image: CGImage, quality: Double, to url: URL) throws -> Int
}

/// ImageIO JPEG writer. Writes no location, device, or date metadata (ImageIO itself adds only
/// the pixel dimensions to a minimal EXIF block); calibration lives in the manifest.
nonisolated struct ImageIOPhotoEncoder: PhotoEncoding {
    func writeJPEG(_ image: CGImage, quality: Double, to url: URL) throws -> Int {
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw CocoaError(.fileWriteUnknown)
        }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw CocoaError(.fileWriteUnknown) }
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                                              ofItemAtPath: url.path)
        return (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }
}

/// Keeps a bounded set of calibrated reference photos during one scan session.
///
/// Frames arrive from the scan's sampling loop. A frame becomes a candidate only when tracking is
/// normal and the camera has moved to a new view; at most one JPEG encode runs at a time (frames
/// arriving meanwhile are dropped). Every callback is checked against the current session, so
/// work finishing after a cancel or a new scan is thrown away instead of attached to the wrong room.
final class RoomEvidenceRecorder {
    enum RecorderError: Error {
        case staleSession
    }

    /// Piece mode cannot use photos whose calibration became uncertain.
    var discardInterruptedPhotos = false

    private let policy: PhotoCandidatePolicy
    private let encoder: any PhotoEncoding
    private let rootDirectory: URL

    private var sessionID: UUID?
    private var lastConsidered: TimeInterval?
    private var lastKeptPose: simd_float4x4?
    private var candidates: [RoomPhotoEvidence] = []
    private var interruptions = 0
    private var encoding: Task<Void, Never>?

    nonisolated static var defaultRoot: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("RoomFlowEvidence", isDirectory: true)
    }

    init(policy: PhotoCandidatePolicy = PhotoCandidatePolicy(),
         encoder: any PhotoEncoding = ImageIOPhotoEncoder(),
         rootDirectory: URL = RoomEvidenceRecorder.defaultRoot) {
        self.policy = policy
        self.encoder = encoder
        self.rootDirectory = rootDirectory
    }

    var maxLongEdge: Int { policy.maxLongEdge }

    /// Counts durable JPEGs only, never in-flight or failed encodes.
    func completedPhotoCount(for objectID: UUID) -> Int {
        candidates.filter { $0.focusObjectId == objectID && $0.trackingContinuous }.count
    }

    private func directory(for session: UUID) -> URL {
        rootDirectory.appendingPathComponent(session.uuidString, isDirectory: true)
    }

    // MARK: - Lifecycle

    /// Begins a new session, abandoning any previous one.
    func start(sessionID: UUID) {
        if let current = self.sessionID { cancel(sessionID: current) }
        self.sessionID = sessionID
        lastConsidered = nil
        lastKeptPose = nil
        candidates = []
        interruptions = 0
        try? FileManager.default.createDirectory(at: directory(for: sessionID), withIntermediateDirectories: true)
    }

    /// Offers a frame. `makeImage` is only called for frames that will actually be kept,
    /// and must return the downscaled, unrotated sensor image.
    func consider(snapshot: PhotoFrameSnapshot, sessionID: UUID, makeImage: () -> CGImage?) {
        guard sessionID == self.sessionID else { return }
        guard snapshot.trackingNormal else {
            // Tracking was lost: poses of earlier photos may no longer match the final room.
            noteTrackingInterrupted(sessionID: sessionID)
            return
        }
        if let last = lastConsidered, snapshot.timestamp - last < policy.minimumInterval { return }
        lastConsidered = snapshot.timestamp
        guard encoding == nil, policy.isNewView(snapshot.cameraToWorld, since: lastKeptPose),
              let image = makeImage() else { return }
        startEncode(image, snapshot: snapshot, sessionID: sessionID, focusObjectId: nil)
    }

    /// Marks a tracking interruption seen outside `consider(...)` (e.g. the focus-shot sampling tick), exactly
    /// like that method's own tracking-lost branch: counts the interruption and marks every current candidate
    /// uncertain, since their poses may no longer match the final room. Ignores a stale session.
    func noteTrackingInterrupted(sessionID: UUID) {
        guard sessionID == self.sessionID else { return }
        interruptions += 1
        for index in candidates.indices { candidates[index].trackingContinuous = false }
        if discardInterruptedPhotos {
            candidates.forEach { if let url = $0.fileURL { try? FileManager.default.removeItem(at: url) } }
            candidates = []
        }
    }

    /// Keeps a deliberate photo of `objectId` now, bypassing the motion gate (the focus tracker decided).
    /// Returns false — and the caller must not count a photo — when the session is stale, tracking isn't
    /// normal, another photo is still encoding, or no image could be made.
    func captureFocused(snapshot: PhotoFrameSnapshot, objectId: UUID, sessionID: UUID,
                        makeImage: () -> CGImage?) -> Bool {
        guard sessionID == self.sessionID, snapshot.trackingNormal, encoding == nil,
              let image = makeImage() else { return false }
        startEncode(image, snapshot: snapshot, sessionID: sessionID, focusObjectId: objectId)
        return true
    }

    /// Records the pose, rescales intrinsics to the exported image, and starts the single in-flight JPEG encode.
    private func startEncode(_ image: CGImage, snapshot: PhotoFrameSnapshot, sessionID: UUID, focusObjectId: UUID?) {
        lastKeptPose = snapshot.cameraToWorld

        // Rescale intrinsics to the exported pixel grid.
        let sx = Float(image.width) / Float(snapshot.imageWidth)
        let sy = Float(image.height) / Float(snapshot.imageHeight)
        var intrinsics = snapshot.intrinsics
        intrinsics[0][0] *= sx
        intrinsics[2][0] *= sx
        intrinsics[1][1] *= sy
        intrinsics[2][1] *= sy

        var photo = RoomPhotoEvidence(
            id: UUID(), sessionID: sessionID, timestamp: snapshot.timestamp,
            pixelWidth: image.width, pixelHeight: image.height,
            cameraToWorld: RoomPhotoEvidence.columnMajor(snapshot.cameraToWorld),
            intrinsics: RoomPhotoEvidence.columnMajor(intrinsics),
            trackingContinuous: true, byteCount: 0
        )
        let url = directory(for: sessionID).appendingPathComponent(photo.fileName)
        photo.fileURL = url
        photo.focusObjectId = focusObjectId
        let encoder = self.encoder, quality = policy.jpegQuality, interruptionsAtCapture = interruptions

        encoding = Task { [weak self, photo] in
            let bytes = await Task.detached(priority: .utility) {
                try? encoder.writeJPEG(image, quality: quality, to: url)
            }.value
            self?.encodingFinished(photo, bytes: bytes, interruptionsAtCapture: interruptionsAtCapture)
        }
    }

    private func encodingFinished(_ photo: RoomPhotoEvidence, bytes: Int?, interruptionsAtCapture: Int) {
        encoding = nil
        guard photo.sessionID == sessionID, let bytes else {
            if let url = photo.fileURL { try? FileManager.default.removeItem(at: url) }
            return
        }
        var photo = photo
        photo.byteCount = bytes
        photo.trackingContinuous = interruptions == interruptionsAtCapture
        if discardInterruptedPhotos && !photo.trackingContinuous {
            if let url = photo.fileURL { try? FileManager.default.removeItem(at: url) }
            return
        }
        candidates.append(photo)
        let (kept, dropped) = policy.thin(candidates)
        candidates = kept
        dropped.forEach { if let url = $0.fileURL { try? FileManager.default.removeItem(at: url) } }
    }

    /// Ends the session and returns the chosen photos (files stay until the caller saves or discards them).
    /// Never fails because of image problems: an empty array still lets the scan be kept.
    func finish(sessionID: UUID) async throws -> [RoomPhotoEvidence] {
        guard sessionID == self.sessionID else { throw RecorderError.staleSession }
        await encoding?.value
        let chosen = policy.selectFinal(candidates)
        let keep = Set(chosen.map(\.id))
        for photo in candidates where !keep.contains(photo.id) {
            if let url = photo.fileURL { try? FileManager.default.removeItem(at: url) }
        }
        self.sessionID = nil
        candidates = []
        return chosen
    }

    /// Abandons the session and deletes only its unfinished files.
    func cancel(sessionID: UUID) {
        guard sessionID == self.sessionID else { return }
        self.sessionID = nil
        candidates = []
        try? FileManager.default.removeItem(at: directory(for: sessionID))
    }

    /// Removes a finished session's temporary photos once they've been copied into a saved room.
    nonisolated static func removeTemporaryFiles(sessionID: UUID, rootDirectory: URL = defaultRoot) {
        try? FileManager.default.removeItem(at: rootDirectory.appendingPathComponent(sessionID.uuidString, isDirectory: true))
    }

    /// Waits for the in-flight encode, if any (tests and orderly shutdown).
    func waitUntilIdle() async {
        await encoding?.value
    }
}

// MARK: - ARKit frames

extension RoomEvidenceRecorder {
    private static let imageContext = CIContext()

    /// Copies pose and calibration out of an AR frame without retaining the frame itself.
    static func snapshot(of frame: ARFrame) -> PhotoFrameSnapshot {
        let camera = frame.camera
        return PhotoFrameSnapshot(
            timestamp: frame.timestamp,
            cameraToWorld: camera.transform,
            intrinsics: camera.intrinsics,
            imageWidth: Int(camera.imageResolution.width),
            imageHeight: Int(camera.imageResolution.height),
            trackingNormal: camera.trackingState == .normal
        )
    }

    /// Offers the current AR frame. Only pose data is copied unless the frame is kept,
    /// and then only a downscaled image; the ARFrame is not retained.
    func consider(frame: ARFrame, sessionID: UUID) {
        let buffer = frame.capturedImage
        let maxLongEdge = maxLongEdge
        consider(snapshot: Self.snapshot(of: frame), sessionID: sessionID) {
            Self.downscaledImage(buffer, maxLongEdge: maxLongEdge)
        }
    }

    /// Focused photo from the current AR frame; see `captureFocused(snapshot:objectId:sessionID:makeImage:)`.
    func captureFocused(frame: ARFrame, objectId: UUID, sessionID: UUID) -> Bool {
        let buffer = frame.capturedImage, maxLongEdge = maxLongEdge
        return captureFocused(snapshot: Self.snapshot(of: frame), objectId: objectId, sessionID: sessionID) {
            Self.downscaledImage(buffer, maxLongEdge: maxLongEdge)
        }
    }

    /// Sensor-orientation image scaled so its long edge is at most `maxLongEdge`. Never rotated or cropped.
    private static func downscaledImage(_ buffer: CVPixelBuffer, maxLongEdge: Int) -> CGImage? {
        let image = CIImage(cvPixelBuffer: buffer)
        let longEdge = max(image.extent.width, image.extent.height)
        let scale = min(1, CGFloat(maxLongEdge) / longEdge)
        let scaled = image.applyingFilter("CILanczosScaleTransform", parameters: [
            kCIInputScaleKey: scale,
            kCIInputAspectRatioKey: 1,
        ])
        let size = CGRect(x: 0, y: 0,
                          width: (image.extent.width * scale).rounded(),
                          height: (image.extent.height * scale).rounded())
        return imageContext.createCGImage(scaled, from: size)
    }
}

import Foundation
import simd

/// An object detected so far in the live scan (RoomPlan world frame, meters).
/// `transform` is the box center pose; `dimensions` are width, height, depth; `center` is the box center.
nonisolated struct LiveObject: Equatable, Sendable {
    var sourceId: UUID
    /// RoomPlan category name, e.g. "sofa".
    var category: String
    var transform: simd_float4x4
    var dimensions: SIMD3<Float>
    var center: SIMD3<Float>
}

/// When a detected object counts as well framed and a focused photo is due. v1 tuning defaults.
nonisolated struct FocusShotPolicy: Sendable {
    var maxShotsPerObject = 3
    /// How long the phone must stay steady on the same object before a photo.
    var dwellSeconds: TimeInterval = 0.6
    /// The whole projected box must sit at least this far (normalized) inside every image edge.
    var edgeMargin = 0.03
    /// The projected box must cover at least this fraction of the image.
    var minAreaFraction = 0.04
    /// Camera to box center, meters; LiDAR depth and detail get unreliable beyond this.
    var maxDistance: Float = 4.0
    /// Steadiness stands in for sharpness: camera speed limits between sampling ticks.
    var maxLinearSpeed: Float = 0.3
    var maxAngularSpeedDegrees: Float = 25
    /// Later photos of the same object must view it from at least this different a direction.
    var minAngleBetweenShotsDegrees: Float = 20
    /// LiDAR depth nearer than the box's near face by more than this means something is in front.
    var occlusionTolerance: Float = 0.3
}

/// What the scan screen shows about the object in focus.
nonisolated struct FocusHint: Equatable, Sendable {
    var objectId: UUID
    var category: String
    var shotsTaken: Int
    var shotsWanted: Int
    /// 0...1 progress toward the next photo while the phone is held steady.
    var dwellProgress: Double
    /// This view was already photographed; the person should look from another side.
    var needsNewAngle: Bool

    var isComplete: Bool { shotsTaken >= shotsWanted }
    /// Ring progress, 0...1.
    var progress: Double {
        min(1, (Double(shotsTaken) + (isComplete ? 0 : dwellProgress)) / Double(max(shotsWanted, 1)))
    }
}

nonisolated enum FocusDecision: Equatable {
    case none
    case hint(FocusHint)
    /// Take a focused photo of `hint.objectId` now; call `recordShot` only if it was accepted.
    case shoot(FocusHint)
}

/// Decides, one sampling tick at a time, which detected object to photograph and when.
/// Pure and deterministic: callers pass camera snapshots and a depth lookup; no ARKit types.
nonisolated struct ObjectFocusTracker {
    private let policy: FocusShotPolicy
    private var previous: (time: TimeInterval, pose: simd_float4x4)?
    private var target: UUID?
    private var dwellStart: TimeInterval?
    /// Unit view directions (camera → object center) of accepted photos, per object.
    private var shotDirections: [UUID: [SIMD3<Float>]] = [:]

    init(policy: FocusShotPolicy = FocusShotPolicy()) {
        self.policy = policy
    }

    func shots(for objectId: UUID) -> Int { shotDirections[objectId]?.count ?? 0 }

    mutating func reset() {
        previous = nil
        target = nil
        dwellStart = nil
        shotDirections = [:]
    }

    /// Records an accepted photo of `objectId` taken from `cameraToWorld`.
    mutating func recordShot(objectId: UUID, cameraToWorld: simd_float4x4, objectCenter: SIMD3<Float>) {
        shotDirections[objectId, default: []].append(Self.direction(from: cameraToWorld, to: objectCenter))
    }

    /// `depthAt(u, v)` returns LiDAR depth in meters at a normalized, top-left-origin image point, or nil.
    mutating func update(objects: [LiveObject], camera: PhotoFrameSnapshot,
                         depthAt: (Double, Double) -> Float?) -> FocusDecision {
        guard camera.trackingNormal else {
            previous = nil
            target = nil
            dwellStart = nil
            return .none
        }
        let steady = isSteady(camera)
        previous = (camera.timestamp, camera.cameraToWorld)

        let c = camera.cameraToWorld.columns.3
        let cameraPosition = SIMD3(c.x, c.y, c.z)
        let inView: [(object: LiveObject, offCenter: Double)] = objects.compactMap { object in
            guard let rect = RoomEvidenceProjector.projectedBounds(
                boxTransform: object.transform, dimensions: object.dimensions,
                cameraToWorld: camera.cameraToWorld, intrinsics: camera.intrinsics,
                pixelWidth: camera.imageWidth, pixelHeight: camera.imageHeight) else { return nil }
            let m = policy.edgeMargin
            guard rect.x >= m, rect.y >= m, rect.maxX <= 1 - m, rect.maxY <= 1 - m,
                  rect.width * rect.height >= policy.minAreaFraction else { return nil }
            let distance = simd_distance(cameraPosition, object.center)
            guard distance <= policy.maxDistance else { return nil }
            if let measured = depthAt(rect.midX, rect.midY), measured.isFinite {
                let nearFace = distance - object.dimensions.max() / 2
                guard measured >= nearFace - policy.occlusionTolerance else { return nil }
            }
            return (object, hypot(rect.midX - 0.5, rect.midY - 0.5))
        }
        guard !inView.isEmpty else {
            target = nil
            dwellStart = nil
            return .none
        }
        // Prefer an object that still needs photos: the most centered one that isn't complete and doesn't
        // need a new angle from here. Only when every in-view object is complete or needs a new angle do we
        // fall back to the most-centered overall, so that hint still shows.
        let minCos = cos(policy.minAngleBetweenShotsDegrees * .pi / 180)
        let evaluated = inView.map { entry -> (object: LiveObject, offCenter: Double, isComplete: Bool, needsNewAngle: Bool) in
            let isComplete = shots(for: entry.object.sourceId) >= policy.maxShotsPerObject
            let direction = Self.direction(from: camera.cameraToWorld, to: entry.object.center)
            let needsNewAngle = (shotDirections[entry.object.sourceId] ?? []).contains(where: { simd_dot($0, direction) > minCos })
            return (entry.object, entry.offCenter, isComplete, needsNewAngle)
        }
        let needsPhoto = evaluated.filter { !$0.isComplete && !$0.needsNewAngle }
        let candidates = needsPhoto.isEmpty ? evaluated : needsPhoto
        let chosen = candidates.min(by: { $0.offCenter < $1.offCenter })!
        let best = chosen.object

        var hint = FocusHint(objectId: best.sourceId, category: best.category, shotsTaken: shots(for: best.sourceId),
                             shotsWanted: policy.maxShotsPerObject, dwellProgress: 0, needsNewAngle: false)
        if chosen.isComplete {
            target = best.sourceId
            dwellStart = nil
            return .hint(hint)
        }
        if chosen.needsNewAngle {
            target = best.sourceId
            dwellStart = nil
            hint.needsNewAngle = true
            return .hint(hint)
        }
        guard steady, target == best.sourceId, let start = dwellStart else {
            target = best.sourceId
            dwellStart = camera.timestamp
            return .hint(hint)
        }
        hint.dwellProgress = min(1, (camera.timestamp - start) / policy.dwellSeconds)
        guard hint.dwellProgress >= 1 else { return .hint(hint) }
        dwellStart = camera.timestamp
        return .shoot(hint)
    }

    private func isSteady(_ camera: PhotoFrameSnapshot) -> Bool {
        guard let previous else { return false }
        let dt = Float(camera.timestamp - previous.time)
        guard dt > 0 else { return false }
        let a = previous.pose.columns.3, b = camera.cameraToWorld.columns.3
        let speed = simd_distance(SIMD3(a.x, a.y, a.z), SIMD3(b.x, b.y, b.z)) / dt
        let relative = simd_quatf(previous.pose).inverse * simd_quatf(camera.cameraToWorld)
        let angle = relative.angle > .pi ? 2 * .pi - relative.angle : relative.angle
        return speed <= policy.maxLinearSpeed && angle * 180 / .pi / dt <= policy.maxAngularSpeedDegrees
    }

    private static func direction(from cameraToWorld: simd_float4x4, to point: SIMD3<Float>) -> SIMD3<Float> {
        let c = cameraToWorld.columns.3
        return simd_normalize(point - SIMD3(c.x, c.y, c.z))
    }
}

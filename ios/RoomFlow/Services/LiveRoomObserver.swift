import Foundation
import OSLog
import RoomPlan
import simd

/// A wall, door, window or opening detected so far in the live scan (RoomPlan world frame, meters).
/// `transform` is the surface center pose (local Z = surface normal); `dimensions.x` width, `.y` height.
nonisolated struct LiveSurface: Equatable, Sendable {
    enum Kind: String, Sendable { case wall, door, window, opening }
    var sourceId: UUID
    var kind: Kind
    var transform: simd_float4x4
    var dimensions: SIMD3<Float>
}

/// Live-object feed: takes `RoomCaptureSession.delegate`, forwards every callback unchanged to the
/// previous delegate, and keeps the newest detected objects for the focus tracker. Debug builds also
/// log detections and whether live IDs survive into the final room.
///
/// Callbacks arrive on RoomPlan's queue, so state is lock-protected and nothing touches the main actor.
nonisolated final class LiveRoomObserver: NSObject, RoomCaptureSessionDelegate {
    private let log = Logger(subsystem: "RoomFlow", category: "LiveObjects")
    private let lock = NSLock()
    /// The delegate that was installed before us; every callback is forwarded to it.
    private weak var forwarded: (any RoomCaptureSessionDelegate)?
    private var startedAt = Date()
    private var lastLoggedAt = Date.distantPast
    /// Live object ID → category name, for everything seen during this session.
    private var seen: [UUID: String] = [:]
    private var current: Set<UUID> = []
    private var updateCount = 0
    private var latest: [LiveObject] = []
    private var latestStructure: [LiveSurface] = []

    /// Takes over `session.delegate`, remembering and forwarding to the previous one.
    /// Call on the main actor before `session.run`; calling twice keeps the original forward target.
    @MainActor
    func install(on session: RoomCaptureSession) {
        let previous = session.delegate
        if previous !== self {
            forwarded = previous
            session.delegate = self
        }
        let described = forwarded.map { String(describing: type(of: $0)) } ?? "nil"
        emit("installed; previous session delegate = \(described)")
        reset()
    }

    /// Compares the final processed room's object IDs with the IDs seen live.
    func logFinalOverlap(with room: CapturedRoom) {
        lock.lock()
        let liveIDs = Set(seen.keys)
        lock.unlock()
        let finalIDs = Set(room.objects.map(\.identifier))
        let shared = finalIDs.intersection(liveIDs).count
        emit("final room: \(finalIDs.count) objects, \(shared) share a live ID (\(liveIDs.count) unique IDs seen live)")
        for object in room.objects {
            emit("  final \(Self.describe(object)) liveID=\(liveIDs.contains(object.identifier) ? "yes" : "NO")")
        }
    }

    private func reset() {
        lock.lock()
        startedAt = Date()
        lastLoggedAt = .distantPast
        seen = [:]
        current = []
        updateCount = 0
        latest = []
        latestStructure = []
        lock.unlock()
    }

    /// Walls, doors, windows and openings in the newest live room update. Safe from any thread.
    func latestSurfaces() -> [LiveSurface] {
        lock.lock()
        defer { lock.unlock() }
        return latestStructure
    }

    /// The objects in the newest live room update (empty before the first update). Safe from any thread.
    func latestObjects() -> [LiveObject] {
        lock.lock()
        defer { lock.unlock() }
        return latest
    }

    private func record(_ room: CapturedRoom) {
        let ids = Set(room.objects.map(\.identifier))
        lock.lock()
        updateCount += 1
        #if DEBUG
        let added = ids.subtracting(current)
        let removed = current.subtracting(ids)
        let removedNames = removed.map { "\(seen[$0] ?? "?") \($0.uuidString.prefix(4))" }
        #endif
        for object in room.objects { seen[object.identifier] = Self.name(object.category) }
        current = ids
        latest = room.objects.map { object in
            let c = object.transform.columns.3
            return LiveObject(sourceId: object.identifier, category: Self.name(object.category),
                              transform: object.transform, dimensions: object.dimensions, center: SIMD3(c.x, c.y, c.z))
        }
        let surface = { (kind: LiveSurface.Kind) in { (s: CapturedRoom.Surface) in
            LiveSurface(sourceId: s.identifier, kind: kind, transform: s.transform, dimensions: s.dimensions) } }
        latestStructure = room.walls.map(surface(.wall)) + room.doors.map(surface(.door))
            + room.windows.map(surface(.window)) + room.openings.map(surface(.opening))
        #if DEBUG
        let now = Date()
        // Log every membership change, otherwise at most once a second.
        let shouldLog = !added.isEmpty || !removed.isEmpty || now.timeIntervalSince(lastLoggedAt) >= 1
        if shouldLog { lastLoggedAt = now }
        let elapsed = now.timeIntervalSince(startedAt)
        let updates = updateCount
        #endif
        lock.unlock()

        #if DEBUG
        guard shouldLog else { return }
        let addedObjects = room.objects.filter { added.contains($0.identifier) }
        var line = String(format: "t=%.1fs update#%d objects=%d", elapsed, updates, ids.count)
        if !addedObjects.isEmpty {
            let names = addedObjects.map { "\(Self.name($0.category)) \($0.identifier.uuidString.prefix(4))" }
            line += " +[\(names.joined(separator: ", "))]"
        }
        if !removedNames.isEmpty { line += " -[\(removedNames.joined(separator: ", "))]" }
        emit(line)
        for object in addedObjects { emit("  new \(Self.describe(object))") }
        #endif
    }

    private func emit(_ message: String) {
        #if DEBUG
        log.notice("[live] \(message, privacy: .public)")
        #endif
    }

    private static func describe(_ object: CapturedRoom.Object) -> String {
        let d = object.dimensions * 100
        let p = object.transform.columns.3
        return "\(name(object.category)) \(object.identifier.uuidString.prefix(4)) "
            + String(format: "%.0f×%.0f×%.0f cm at (%.2f, %.2f, %.2f)", d.x, d.y, d.z, p.x, p.y, p.z)
            + " conf=\(object.confidence)"
    }

    private static func name(_ category: CapturedRoom.Object.Category) -> String {
        String(describing: category)
    }

    // MARK: - RoomCaptureSessionDelegate (log, then forward unchanged)

    func captureSession(_ session: RoomCaptureSession, didUpdate room: CapturedRoom) {
        record(room)
        forwarded?.captureSession(session, didUpdate: room)
    }

    func captureSession(_ session: RoomCaptureSession, didAdd room: CapturedRoom) {
        forwarded?.captureSession(session, didAdd: room)
    }

    func captureSession(_ session: RoomCaptureSession, didChange room: CapturedRoom) {
        forwarded?.captureSession(session, didChange: room)
    }

    func captureSession(_ session: RoomCaptureSession, didRemove room: CapturedRoom) {
        forwarded?.captureSession(session, didRemove: room)
    }

    func captureSession(_ session: RoomCaptureSession, didProvide instruction: RoomCaptureSession.Instruction) {
        forwarded?.captureSession(session, didProvide: instruction)
    }

    func captureSession(_ session: RoomCaptureSession, didStartWith configuration: RoomCaptureSession.Configuration) {
        emit("session started")
        forwarded?.captureSession(session, didStartWith: configuration)
    }

    func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: (any Error)?) {
        lock.lock()
        let unique = seen.count
        let updates = updateCount
        lock.unlock()
        emit("session ended after \(updates) updates, \(unique) unique live object IDs, error=\(error.map { "\($0)" } ?? "nil")")
        forwarded?.captureSession(session, didEndWith: data, error: error)
    }
}

import Foundation

/// Saves scanned rooms on the device so they can be reopened without rescanning.
///
/// Layout under `root`:
/// ```
/// rooms/<capture-id>/capture.roomplan.json   original RoomPlan bytes, written once, never replaced
/// rooms/<capture-id>/editable.roomflow.json  current RoomModel, replaced atomically on each save
/// rooms/<capture-id>/record.json             name, date, evidence status
/// rooms/<capture-id>/photos.json, photos/     optional reference photos and their calibration
/// rooms/<capture-id>/appearance.json          optional approximate colors and photo regions
/// staging/…                                  in-progress saves; never listed
/// ```
/// A new room is assembled in `staging/` and published with a single directory rename,
/// so a crash or full disk can never leave a half-saved room in the list.
actor RoomArchiveStore {
    enum ArchiveError: LocalizedError {
        case differentScanAlreadySaved
        case notFound

        var errorDescription: String? {
            switch self {
            case .differentScanAlreadySaved: "A different scan is already saved under this room's ID."
            case .notFound: "This saved room couldn't be found."
            }
        }
    }

    typealias DataWriter = @Sendable (Data, URL) throws -> Void

    static let shared = RoomArchiveStore(root: defaultRoot)

    nonisolated static var defaultRoot: URL {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("RoomFlow/SavedRooms", isDirectory: true)
    }

    /// Atomic write with data protection (readable once the phone has been unlocked after boot).
    nonisolated static let protectedWrite: DataWriter = { data, url in
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private static let rawName = "capture.roomplan.json"
    private static let editableName = "editable.roomflow.json"
    private static let recordName = "record.json"
    private static let photosName = "photos.json"
    private static let photosFolder = "photos"
    private static let appearanceName = "appearance.json"

    private let root: URL
    private let writeData: DataWriter
    private let fileManager = FileManager.default

    init(root: URL, writeData: @escaping DataWriter = RoomArchiveStore.protectedWrite) {
        self.root = root
        self.writeData = writeData
    }

    private var roomsDirectory: URL { root.appendingPathComponent("rooms", isDirectory: true) }
    private var stagingDirectory: URL { root.appendingPathComponent("staging", isDirectory: true) }

    private func roomDirectory(_ id: UUID) -> URL {
        roomsDirectory.appendingPathComponent(id.uuidString, isDirectory: true)
    }

    // MARK: - Saving

    /// Saves a freshly processed scan. Retrying with identical raw bytes is a no-op;
    /// a different scan under the same ID is refused so the original is never replaced.
    func saveCapture(id: UUID, rawData: Data, editableData: Data,
                     photos: [RoomPhotoEvidence] = [],
                     appearance: RoomAppearanceEvidence? = nil,
                     name: String? = nil, capturedAt: Date = Date()) throws {
        let destination = roomDirectory(id)
        if fileManager.fileExists(atPath: destination.path) {
            let existing = try Data(contentsOf: destination.appendingPathComponent(Self.rawName))
            guard existing == rawData else { throw ArchiveError.differentScanAlreadySaved }
            return
        }

        let staging = stagingDirectory.appendingPathComponent("\(id.uuidString)-\(UUID().uuidString)", isDirectory: true)
        try fileManager.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: staging) } // no-op once the move succeeded

        let record = SavedRoomRecord(
            id: id,
            name: name ?? Self.defaultName(for: capturedAt),
            capturedAt: capturedAt,
            editedRevision: Self.revision(in: editableData) ?? 0,
            evidenceStatus: photos.isEmpty ? .geometryOnly : .photos
        )
        try writeData(rawData, staging.appendingPathComponent(Self.rawName))
        try writeData(editableData, staging.appendingPathComponent(Self.editableName))
        if !photos.isEmpty {
            let folder = staging.appendingPathComponent(Self.photosFolder, isDirectory: true)
            try fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
            for photo in photos {
                guard let source = photo.fileURL else { throw CocoaError(.fileNoSuchFile) }
                try fileManager.copyItem(at: source, to: folder.appendingPathComponent(photo.fileName))
            }
            try writeData(Self.encoder.encode(photos), staging.appendingPathComponent(Self.photosName))
        }
        if let appearance {
            try writeData(Self.encoder.encode(appearance), staging.appendingPathComponent(Self.appearanceName))
        }
        try writeData(Self.encoder.encode(record), staging.appendingPathComponent(Self.recordName))

        try fileManager.createDirectory(at: roomsDirectory, withIntermediateDirectories: true)
        try fileManager.moveItem(at: staging, to: destination)
    }

    /// Replaces the editable room. The original scan file is never touched; a failed
    /// write leaves the previous editable file in place (atomic replace).
    func saveEdits(id: UUID, editableData: Data) throws {
        let directory = roomDirectory(id)
        guard fileManager.fileExists(atPath: directory.appendingPathComponent(Self.recordName).path) else {
            throw ArchiveError.notFound
        }
        try writeData(editableData, directory.appendingPathComponent(Self.editableName))
    }

    // MARK: - Reading

    func load(id: UUID) throws -> RoomArchive {
        let directory = roomDirectory(id)
        guard let record = readRecord(in: directory) else { throw ArchiveError.notFound }
        var photos: [RoomPhotoEvidence] = []
        if let data = try? Data(contentsOf: directory.appendingPathComponent(Self.photosName)) {
            photos = try Self.decoder.decode([RoomPhotoEvidence].self, from: data).map { photo in
                var photo = photo
                photo.fileURL = directory.appendingPathComponent(Self.photosFolder).appendingPathComponent(photo.fileName)
                return photo
            }
        }
        return RoomArchive(
            record: record,
            rawData: try Data(contentsOf: directory.appendingPathComponent(Self.rawName)),
            editableData: try Data(contentsOf: directory.appendingPathComponent(Self.editableName)),
            photos: photos,
            appearance: (try? Data(contentsOf: directory.appendingPathComponent(Self.appearanceName)))
                .flatMap { try? Self.decoder.decode(RoomAppearanceEvidence.self, from: $0) }
        )
    }

    /// Complete saved rooms, newest first. Staging leftovers and folders without a record are skipped.
    func list() throws -> [SavedRoomRecord] {
        guard fileManager.fileExists(atPath: roomsDirectory.path) else { return [] }
        return try fileManager.contentsOfDirectory(at: roomsDirectory, includingPropertiesForKeys: nil)
            .compactMap(readRecord(in:))
            .sorted { $0.capturedAt > $1.capturedAt }
    }

    private func readRecord(in directory: URL) -> SavedRoomRecord? {
        guard let data = try? Data(contentsOf: directory.appendingPathComponent(Self.recordName)),
              var record = try? Self.decoder.decode(SavedRoomRecord.self, from: data),
              fileManager.fileExists(atPath: directory.appendingPathComponent(Self.rawName).path),
              let editable = try? Data(contentsOf: directory.appendingPathComponent(Self.editableName))
        else { return nil }
        // The editable file is the source of truth for the revision, so an edit is one atomic write.
        record.editedRevision = Self.revision(in: editable) ?? record.editedRevision
        return record
    }

    // MARK: - Helpers

    private struct RevisionOnly: Decodable { var revision: Int? }

    private static func revision(in editableData: Data) -> Int? {
        (try? JSONDecoder().decode(RevisionOnly.self, from: editableData))?.revision
    }

    private static func defaultName(for date: Date) -> String {
        "Room · " + date.formatted(date: .abbreviated, time: .shortened)
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

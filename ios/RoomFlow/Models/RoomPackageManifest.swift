import Foundation

/// `manifest.json` of a `.roomflow.zip` room package (schema v1, proposed; see docs/ios-room-package.md).
///
/// Describes exactly which files the package holds, with sizes and SHA-256 checksums, plus the
/// calibration of each shared photo and candidate photo regions for captured objects.
nonisolated struct RoomPackageManifest: Codable, Equatable, Sendable {
    var schemaVersion = 1
    var packageId: UUID
    var captureId: UUID
    var capturedAt: Date
    var units = "meters"
    var coordinateSpace = "roomplan-native-v1"
    /// The Review-room selection revision this package was built from.
    var selectionRevision: Int
    /// Selected photos left out to stay within the size limits.
    var omittedPhotoCount = 0
    var files: [FileEntry]
    var photos: [PhotoEntry]
    var associations: [RoomPhotoAssociation]

    struct FileEntry: Codable, Equatable, Sendable {
        /// Relative to the package folder.
        var path: String
        var mediaType: String
        var byteCount: Int
        /// Lowercase hex SHA-256 of the file's bytes.
        var sha256: String
    }

    struct PhotoEntry: Codable, Equatable, Sendable {
        var photoId: UUID
        var path: String
        var sessionId: UUID
        /// ARFrame timestamp, seconds.
        var timestamp: TimeInterval
        var pixelWidth: Int
        var pixelHeight: Int
        /// Camera-to-world, RoomPlan native world frame, 16 numbers, column-major.
        var cameraToWorld: [Float]
        /// Intrinsics for exactly these pixels, 9 numbers, column-major.
        var intrinsics: [Float]
        var pixelOrientation: String
        var trackingContinuous: Bool
    }

    enum ValidationError: Error, Equatable {
        case missingRawCapture
        case disallowedPath(String)
        case duplicatePath(String)
        case invalidPhoto(UUID)
        case invalidAssociation(UUID)
    }

    static let rawPath = "capture.roomplan.json"
    static let editablePath = "editable.roomflow.json"
    static let appearancePath = "appearance.json"
    static let wallArtPath = "wallArt.json"
    static let manifestPath = "manifest.json"

    /// Only these paths may appear: the four JSON files, `photos/<UUID>.jpg`, and `art/<UUID>.jpg`.
    static func isAllowed(_ path: String) -> Bool {
        if [rawPath, editablePath, appearancePath, wallArtPath].contains(path) { return true }
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[1].hasSuffix(".jpg"), parts[0] == "photos" || parts[0] == "art" else { return false }
        return UUID(uuidString: String(parts[1].dropLast(4))) != nil
    }

    /// Rejects anything a consumer shouldn't have to defend against: unknown or traversal paths,
    /// duplicates, a missing raw scan, malformed calibration, and non-finite or out-of-range numbers.
    func validate() throws {
        var seen = Set<String>()
        for file in files {
            guard Self.isAllowed(file.path) else { throw ValidationError.disallowedPath(file.path) }
            guard seen.insert(file.path).inserted else { throw ValidationError.duplicatePath(file.path) }
        }
        guard seen.contains(Self.rawPath) else { throw ValidationError.missingRawCapture }
        for photo in photos {
            guard seen.contains(photo.path), photo.pixelWidth > 0, photo.pixelHeight > 0,
                  photo.cameraToWorld.count == 16, photo.intrinsics.count == 9,
                  (photo.cameraToWorld + photo.intrinsics).allSatisfy(\.isFinite), photo.timestamp.isFinite
            else { throw ValidationError.invalidPhoto(photo.photoId) }
        }
        let photoIDs = Set(photos.map(\.photoId))
        for association in associations {
            guard photoIDs.contains(association.photoId), association.rect.count == 4,
                  association.rect.allSatisfy({ $0.isFinite && (0...1).contains($0) })
            else { throw ValidationError.invalidAssociation(association.photoId) }
        }
    }

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

/// `appearance.json` inside a package: approximate colors and the user's names, all keyed by
/// RoomPlan source UUID and labeled with where they came from. Never geometry or categories.
nonisolated struct PackageAppearance: Codable, Equatable, Sendable {
    var schemaVersion = 1
    var captureId: UUID
    var colors: [SourceColor]
    var floorColor: EstimatedColor?
    var annotations: [ObjectAnnotation]
}

/// `wallArt.json` inside a package: confirmed wall art still in the room's saved list, in RoomPlan
/// native world coordinates (`docs/ios-room-package.md`, agreed layout in
/// `.superpowers/sdd/wall-art-package/format.md`, approved by the Designer side 2026-09-27). Only
/// written when at least one item qualifies; items without a resolved `worldCenter`/`worldNormal`
/// (older saves) are left out of `items`, never written with fabricated coordinates.
nonisolated struct WallArtPackage: Codable, Equatable, Sendable {
    var schemaVersion = 1
    var captureId: UUID
    var items: [Item]

    struct Item: Codable, Equatable, Sendable {
        var artId: UUID
        /// RoomPlan wall `identifier` this piece is attached to; may be absent from the web room.
        var wallSourceId: UUID
        /// RoomPlan native world coordinates, meters.
        var center: [Double]
        /// Unit vector, RoomPlan native world space, pointing from the wall into the room.
        var normal: [Double]
        var width: Double
        var height: Double
        var standoff: Double
        var sightingCount: Int
        /// `art/<artId>.jpg`, or nil when no photo was captured or it didn't fit the size budget.
        var photoPath: String?
        var method: String
        var provenance: String
    }
}

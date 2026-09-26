import CryptoKit
import Foundation

/// Turns a folder into a `.zip` file.
nonisolated protocol RoomPackageArchiver: Sendable {
    func archive(directory: URL, to destination: URL) throws
}

/// Uses iOS's built-in zipping (file coordination "for uploading"); no third-party dependency.
/// The archive contains the directory itself as its single top-level folder.
nonisolated struct CoordinatorZipArchiver: RoomPackageArchiver {
    func archive(directory: URL, to destination: URL) throws {
        var coordinationError: NSError?
        var copyError: (any Error)?
        NSFileCoordinator().coordinate(readingItemAt: directory, options: .forUploading, error: &coordinationError) { zipURL in
            // The system's zip is temporary and only valid inside this block.
            do { try FileManager.default.copyItem(at: zipURL, to: destination) } catch { copyError = error }
        }
        if let error = coordinationError ?? copyError { throw error }
    }
}

/// Builds the versioned `.roomflow.zip` room package from a saved room and the user's Review choices.
///
/// Files are assembled one by one from an allowlist into a fresh staging folder (the saved-room
/// folder is never zipped wholesale), checksummed, validated, archived to a temporary name and then
/// moved into place. Any failure leaves the saved room untouched and publishes nothing.
nonisolated enum RoomPackageExport {
    struct Result: Sendable {
        var url: URL
        var sharedPhotoCount: Int
        /// Selected photos left out to stay within the limits.
        var omittedPhotoCount: Int
    }

    /// v1 limits for shared images; tuning defaults, not guarantees.
    static let maxPhotos = 12
    static let maxPhotoBytes = 20 * 1024 * 1024

    static var defaultDestination: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("RoomFlowPackages", isDirectory: true)
    }

    static func fileName(captureId: UUID) -> String {
        "\(captureId.uuidString).roomflow.zip"
    }

    static func export(archive: RoomArchive, selection: RoomEvidenceSelection,
                       destination: URL = defaultDestination,
                       archiver: any RoomPackageArchiver = CoordinatorZipArchiver()) async throws -> Result {
        try await Task.detached(priority: .userInitiated) {
            try build(archive: archive, selection: selection, destination: destination, archiver: archiver)
        }.value
    }

    private static func build(archive: RoomArchive, selection: RoomEvidenceSelection,
                              destination: URL, archiver: any RoomPackageArchiver) throws -> Result {
        let fileManager = FileManager.default
        let captureId = archive.record.id
        let work = fileManager.temporaryDirectory
            .appendingPathComponent("RoomFlowPackageStaging", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let package = work.appendingPathComponent("\(captureId.uuidString).roomflow", isDirectory: true)
        try fileManager.createDirectory(at: package, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: work) }

        var files: [RoomPackageManifest.FileEntry] = []
        func add(_ data: Data, at path: String, mediaType: String) throws {
            let url = package.appendingPathComponent(path)
            try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url)
            files.append(.init(path: path, mediaType: mediaType, byteCount: data.count, sha256: sha256Hex(data)))
        }

        // Geometry: the original scan bytes, unchanged, plus the editable room.
        try add(archive.rawData, at: RoomPackageManifest.rawPath, mediaType: "application/json")
        try add(archive.editableData, at: RoomPackageManifest.editablePath, mediaType: "application/json")

        // Appearance: approximate colors and the user's names, only when there is something to say.
        let appearance = PackageAppearance(
            captureId: captureId,
            colors: archive.appearance?.colors ?? [],
            floorColor: archive.appearance?.floorColor,
            annotations: selection.annotations
        )
        if !appearance.colors.isEmpty || appearance.floorColor != nil || !appearance.annotations.isEmpty {
            try add(RoomPackageManifest.encoder.encode(appearance), at: RoomPackageManifest.appearancePath, mediaType: "application/json")
        }

        // Photos: only the user's current selection, within the count and size limits.
        let selected = selection.sharedPhotos(from: archive.photos)
        var photoEntries: [RoomPackageManifest.PhotoEntry] = []
        var photoBytes = 0
        for photo in selected where photoEntries.count < maxPhotos {
            guard let source = photo.fileURL else { throw CocoaError(.fileNoSuchFile) }
            let values = try source.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true else { throw CocoaError(.fileReadInvalidFileName) }
            let data = try Data(contentsOf: source)
            guard photoBytes + data.count <= maxPhotoBytes else { continue }
            photoBytes += data.count
            let path = "photos/\(photo.fileName)"
            try add(data, at: path, mediaType: "image/jpeg")
            photoEntries.append(.init(
                photoId: photo.id, path: path, sessionId: photo.sessionID, timestamp: photo.timestamp,
                pixelWidth: photo.pixelWidth, pixelHeight: photo.pixelHeight,
                cameraToWorld: photo.cameraToWorld, intrinsics: photo.intrinsics,
                pixelOrientation: photo.pixelOrientation, trackingContinuous: photo.trackingContinuous))
        }
        let sharedIDs = Set(photoEntries.map(\.photoId))

        let manifest = RoomPackageManifest(
            packageId: UUID(),
            captureId: captureId,
            capturedAt: archive.record.capturedAt,
            selectionRevision: selection.revision,
            omittedPhotoCount: selected.count - photoEntries.count,
            files: files,
            photos: photoEntries,
            associations: (archive.appearance?.associations ?? []).filter { sharedIDs.contains($0.photoId) }
        )
        try manifest.validate()
        try RoomPackageManifest.encoder.encode(manifest)
            .write(to: package.appendingPathComponent(RoomPackageManifest.manifestPath))

        // Archive under a temporary name, then move into place so a half-written zip is never shared.
        let temporaryZip = work.appendingPathComponent("package.zip")
        try archiver.archive(directory: package, to: temporaryZip)
        try fileManager.createDirectory(at: destination, withIntermediateDirectories: true)
        let final = destination.appendingPathComponent(fileName(captureId: captureId))
        if fileManager.fileExists(atPath: final.path) {
            _ = try fileManager.replaceItemAt(final, withItemAt: temporaryZip)
        } else {
            try fileManager.moveItem(at: temporaryZip, to: final)
        }
        return Result(url: final, sharedPhotoCount: photoEntries.count, omittedPhotoCount: manifest.omittedPhotoCount)
    }

    private static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}

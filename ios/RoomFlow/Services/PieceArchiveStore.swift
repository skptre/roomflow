import Foundation
import CryptoKit

/// Durable local piece exports, retained through canceled sharing and application relaunch.
actor PieceArchiveStore {
    static let shared = PieceArchiveStore(root: defaultRoot)

    nonisolated static var defaultRoot: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("RoomFlow/SavedPieces", isDirectory: true)
    }

    private let root: URL

    /// An explicit root allows isolated persistence tests.
    init(root: URL) { self.root = root }

    /// Validates before atomically replacing this ID's export. Hashing IDs prevents path traversal.
    @discardableResult
    func save(_ piece: ScannedPiece) throws -> URL {
        let bytes = try piece.encoded()
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let key = SHA256.hash(data: Data(piece.id.utf8)).map { String(format: "%02x", $0) }.joined()
        let url = root.appendingPathComponent("\(key).roomflow-piece.json")
        try bytes.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return url
    }

    /// Returns the already-validated local export for repeat sharing without rewriting its photo choice.
    func url(for piece: ScannedPiece) throws -> URL? {
        let key = SHA256.hash(data: Data(piece.id.utf8)).map { String(format: "%02x", $0) }.joined()
        let url = root.appendingPathComponent("\(key).roomflow-piece.json")
        guard FileManager.default.fileExists(atPath: url.path),
              let bytes = try? Data(contentsOf: url),
              let stored = try? JSONDecoder().decode(ScannedPiece.self, from: bytes),
              stored == piece, (try? stored.validate()) != nil else { return nil }
        return url
    }

    /// Loads valid saved pieces. Incomplete or corrupt individual files never hide other exports.
    func list() throws -> [ScannedPiece] {
        guard FileManager.default.fileExists(atPath: root.path) else { return [] }
        let urls = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.fileSizeKey])
        return urls.sorted { $0.lastPathComponent < $1.lastPathComponent }.compactMap { url in
            guard url.lastPathComponent.hasSuffix(".roomflow-piece.json"),
                  let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
                  size <= ScannedPiece.maxJSONBytes,
                  let bytes = try? Data(contentsOf: url), bytes.count <= ScannedPiece.maxJSONBytes,
                  let piece = try? JSONDecoder().decode(ScannedPiece.self, from: bytes),
                  (try? piece.validate()) != nil else { return nil }
            return piece
        }
    }
}

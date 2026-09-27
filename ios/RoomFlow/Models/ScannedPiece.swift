import Foundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers

/// Portable, selected-object-only evidence. Dimensions are meters; no capture world pose is exported.
nonisolated struct ScannedPiece: Codable, Equatable, Identifiable, Sendable {
    var format = "roomflow-piece"
    var version = 1
    var id: String
    var name: String
    var category: String
    var dimensions: Dimensions
    var color: String? = nil
    var photos: [Photo] = []

    static let maxPhotoBytes = 1_500_000
    static let maxJSONBytes = 7_000_000

    /// Supplied physical dimensions, with explicit measurement provenance.
    struct Dimensions: Codable, Equatable, Sendable {
        var width: Double
        var height: Double
        var depth: Double
        var source: String
    }

    /// Metadata-stripped, upright JPEG encoded as plain base64 (not a data URL).
    struct Photo: Codable, Equatable, Sendable {
        var mimeType = "image/jpeg"
        var data: String
    }

    /// Invalid exports are rejected before any durable file is changed.
    enum ValidationError: LocalizedError {
        case invalid(String)
        var errorDescription: String? {
            switch self { case .invalid(let message): message }
        }
    }

    /// Checks the portable contract, including actual JPEG contents and decoded byte limits.
    func validate() throws {
        guard format == "roomflow-piece", version == 1 else {
            throw ValidationError.invalid("This piece file has an unsupported format.")
        }
        guard !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !category.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              id.utf16.count <= 100, name.utf16.count <= 120, category.utf16.count <= 80 else {
            throw ValidationError.invalid("Use a piece ID up to 100 characters, a name up to 120, and a category up to 80.")
        }
        guard [dimensions.width, dimensions.height, dimensions.depth].allSatisfy({ $0.isFinite && $0 > 0 && $0 <= 20 }),
              ["captured", "user", "estimated"].contains(dimensions.source) else {
            throw ValidationError.invalid("Piece dimensions must be greater than zero and at most 20 meters, with a known source.")
        }
        if let color, color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) == nil {
            throw ValidationError.invalid("The piece color must be a six-digit hex color.")
        }
        guard photos.count <= 3 else { throw ValidationError.invalid("A piece can include at most three photos.") }
        for photo in photos {
            guard photo.mimeType == "image/jpeg", photo.data.utf8.count <= 2_000_000,
                  let bytes = Data(base64Encoded: photo.data), !bytes.isEmpty, bytes.count <= Self.maxPhotoBytes,
                  let image = CGImageSourceCreateWithData(bytes as CFData, nil),
                  CGImageSourceGetType(image) as String? == UTType.jpeg.identifier,
                  Self.hasBoundedPixelSize(image),
                  CGImageSourceCreateImageAtIndex(image, 0, nil) != nil else {
                throw ValidationError.invalid("Each photo must be a valid JPEG no larger than 1.5 MB.")
            }
        }
        guard try JSONEncoder().encode(self).count <= Self.maxJSONBytes else {
            throw ValidationError.invalid("The piece file must be no larger than 7 MB.")
        }
    }

    /// Returns bounded JSON after validation; no price, link, room geometry, or pose is included.
    func encoded() throws -> Data {
        try validate()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(self)
        guard data.count <= Self.maxJSONBytes else { throw ValidationError.invalid("The piece file must be no larger than 7 MB.") }
        return data
    }

    /// Reads dimensions before pixel decoding to bound memory used by external JPEG data.
    private static func hasBoundedPixelSize(_ source: CGImageSource) -> Bool {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any],
              let width = properties[kCGImagePropertyPixelWidth as String] as? Int,
              let height = properties[kCGImagePropertyPixelHeight as String] as? Int else { return false }
        return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 16_000_000
    }

    /// Finds the clockwise quarter turns that put camera-space world up closest to image top.
    static func uprightQuarterTurns(cameraToWorld: [Float]) -> Int {
        guard cameraToWorld.count == 16, cameraToWorld.allSatisfy(\.isFinite) else { return 0 }
        var x = cameraToWorld[1], y = -cameraToWorld[5]
        var best = 0
        var score = -Float.infinity
        for turn in 0..<4 {
            if -y > score { best = turn; score = -y }
            (x, y) = (-y, x)
        }
        return best
    }

    /// Rotates sensor pixels from recorded world up, resizes, and reencodes without capture metadata.
    static func photo(from evidence: RoomPhotoEvidence) throws -> Photo {
        guard let url = evidence.fileURL,
              let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              hasBoundedPixelSize(source),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw ValidationError.invalid("This piece photo could not be read. Try capturing it again.")
        }
        let orientations: [CGImagePropertyOrientation] = [.up, .right, .down, .left]
        let upright = CIImage(cgImage: image).oriented(orientations[uprightQuarterTurns(cameraToWorld: evidence.cameraToWorld)])
        let scale = min(1, 1024 / max(upright.extent.width, upright.extent.height))
        let resized = upright.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let pixels = CIContext().createCGImage(resized, from: resized.extent) else {
            throw ValidationError.invalid("This piece photo could not be prepared.")
        }
        for quality in [0.85, 0.7, 0.5, 0.3] {
            let bytes = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(bytes, UTType.jpeg.identifier as CFString, 1, nil) else { continue }
            CGImageDestinationAddImage(destination, pixels, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
            if CGImageDestinationFinalize(destination), bytes.length <= maxPhotoBytes {
                return Photo(data: (bytes as Data).base64EncodedString())
            }
        }
        throw ValidationError.invalid("This piece photo is too large to export.")
    }
}

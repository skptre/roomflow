import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import Testing
@testable import RoomFlow

struct ScannedPieceTests {
    private func piece() -> ScannedPiece {
        ScannedPiece(id: "stable-chair", name: "My chair", category: "chair",
                     dimensions: .init(width: 0.6, height: 0.9, depth: 0.7, source: "captured"))
    }

    @Test func portableRoundTripOmitsRoomAndMoney() throws {
        let original = piece()
        let bytes = try original.encoded()
        #expect(try JSONDecoder().decode(ScannedPiece.self, from: bytes) == original)
        let json = try #require(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
        #expect(Set(json.keys) == Set(["format", "version", "id", "name", "category", "dimensions", "photos"]))
    }

    @Test func rejectsInvalidDimensionsAndProvenance() throws {
        for value in [0, -1, Double.nan, .infinity, 20.01] {
            var invalid = piece()
            invalid.dimensions.width = value
            #expect(throws: (any Error).self) { try invalid.encoded() }
        }
        var invalid = piece()
        invalid.dimensions.source = "guessed-by-camera"
        #expect(throws: (any Error).self) { try invalid.validate() }
        invalid.dimensions.source = "user"
        invalid.dimensions.width = 20
        try invalid.validate()
    }

    @Test func rejectsMalformedPhotosAndOversizedJSON() {
        var invalid = piece()
        invalid.photos = [.init(data: "not base64")]
        #expect(throws: (any Error).self) { try invalid.validate() }
        invalid.photos = [.init(data: Data("not a JPEG".utf8).base64EncodedString())]
        #expect(throws: (any Error).self) { try invalid.validate() }
        invalid.photos = [.init(data: Data(repeating: 0, count: 1_500_001).base64EncodedString())]
        #expect(throws: (any Error).self) { try invalid.validate() }
        invalid.photos = Array(repeating: .init(data: ""), count: 4)
        #expect(throws: (any Error).self) { try invalid.validate() }
        invalid.photos = []
        invalid.name = String(repeating: "x", count: 7_000_001)
        #expect(throws: (any Error).self) { try invalid.encoded() }
    }

    @Test func textBoundsMatchWebUTF16Limits() throws {
        var value = piece()
        value.id = String(repeating: "x", count: 100)
        value.name = String(repeating: "x", count: 120)
        value.category = String(repeating: "x", count: 80)
        try value.validate()
        value.id += "x"
        #expect(throws: (any Error).self) { try value.validate() }
        value = piece()
        value.name = String(repeating: "x", count: 121)
        #expect(throws: (any Error).self) { try value.validate() }
        value = piece()
        value.category = String(repeating: "x", count: 81)
        #expect(throws: (any Error).self) { try value.validate() }
        value = piece()
        value.name = String(repeating: "🪑", count: 61)
        #expect(throws: (any Error).self) { try value.validate() }
    }

    @Test func rejectsJPEGPixelDimensionsBeforeDecode() throws {
        let context = try #require(CGContext(data: nil, width: 4097, height: 1, bitsPerComponent: 8,
                                             bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        let image = try #require(context.makeImage())
        let data = NSMutableData()
        let destination = try #require(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, nil)
        #expect(CGImageDestinationFinalize(destination))
        var value = piece()
        value.photos = [.init(data: (data as Data).base64EncodedString())]
        #expect(throws: (any Error).self) { try value.validate() }
    }

    @Test func rejectsWrongFormatVersionAndColor() {
        var invalid = piece()
        invalid.format = "roomflow-room"
        #expect(throws: (any Error).self) { try invalid.validate() }
        invalid = piece()
        invalid.version = 2
        #expect(throws: (any Error).self) { try invalid.validate() }
        invalid = piece()
        invalid.color = "red"
        #expect(throws: (any Error).self) { try invalid.validate() }
    }

    @Test func durableArchiveReopensAndFailedSavePreservesPreviousPiece() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = PieceArchiveStore(root: root)
        var original = piece()
        original.id = "../../unsafe"
        let url = try await store.save(original)
        #expect(url.deletingLastPathComponent().standardizedFileURL == root.standardizedFileURL)
        #expect(url.lastPathComponent.hasSuffix(".roomflow-piece.json"))
        let reopened = PieceArchiveStore(root: root)
        #expect(try await reopened.list() == [original])
        #expect(try await reopened.url(for: original) == url)
        var invalid = original
        invalid.dimensions.height = -1
        do {
            try await store.save(invalid)
            Issue.record("Invalid piece saved")
        } catch {}
        #expect(try await reopened.list() == [original])
        var updated = original
        updated.name = "Renamed chair"
        try await store.save(updated)
        #expect(try await reopened.list() == [updated])
        try Data("interrupted".utf8).write(to: root.appendingPathComponent("bad.roomflow-piece.json"))
        #expect(try await reopened.list() == [updated])
    }

    @Test func unavailableArchiveDirectoryThrows() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data("occupied".utf8).write(to: root)
        defer { try? FileManager.default.removeItem(at: root) }
        do {
            try await PieceArchiveStore(root: root).save(piece())
            Issue.record("Save to a regular file succeeded")
        } catch {}
        #expect(try Data(contentsOf: root) == Data("occupied".utf8))
    }

    @Test func cameraWorldUpSupportsBothPortraitAndLandscapeOrientations() {
        for (x, y, turns): (Float, Float, Int) in [(0, 1, 0), (-1, 0, 1), (0, -1, 2), (1, 0, 3)] {
            var camera = Array(repeating: Float(0), count: 16)
            camera[1] = x
            camera[5] = y
            #expect(ScannedPiece.uprightQuarterTurns(cameraToWorld: camera) == turns)
        }
    }

    @Test func exportedPhotoIsRotatedAndCaptureMetadataIsRemoved() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let url = root.appendingPathComponent("sensor.jpg")
        let context = try #require(CGContext(data: nil, width: 2048, height: 1024, bitsPerComponent: 8,
                                             bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
        context.setFillColor(CGColor(red: 0.8, green: 0.1, blue: 0.1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: 2048, height: 1024))
        let image = try #require(context.makeImage())
        let destination = try #require(CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, [kCGImagePropertyExifDictionary: [kCGImagePropertyExifUserComment: "private capture info"]] as CFDictionary)
        #expect(CGImageDestinationFinalize(destination))
        var camera = Array(repeating: Float(0), count: 16)
        camera[1] = -1
        let evidence = RoomPhotoEvidence(id: UUID(), sessionID: UUID(), timestamp: 1,
                                         pixelWidth: 2048, pixelHeight: 1024, cameraToWorld: camera,
                                         intrinsics: [], trackingContinuous: true, byteCount: 0, fileURL: url)
        let photo = try ScannedPiece.photo(from: evidence)
        let data = try #require(Data(base64Encoded: photo.data))
        #expect(data.count <= ScannedPiece.maxPhotoBytes)
        let source = try #require(CGImageSourceCreateWithData(data as CFData, nil))
        let output = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
        #expect(output.width == 512)
        #expect(output.height == 1024)
        let properties = try #require(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [String: Any])
        let exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any]
        #expect(exif?[kCGImagePropertyExifUserComment as String] == nil)
        #expect(properties[kCGImagePropertyGPSDictionary as String] == nil)
        var exported = piece()
        exported.photos = [photo]
        try exported.validate()
    }
}

import Foundation
import Testing
@testable import RoomFlow

struct PhotoCoverageTests {
    private func object(_ category: String) -> RoomObject {
        RoomObject(id: "\(category)-1", category: category, position: Vector3(x: 0, y: 0, z: 0),
                   dimensions: ObjectDimensions(width: 1, height: 1, depth: 1), yawDegrees: 0,
                   movable: true, source: "roomplan", confidence: "high", sourceId: UUID())
    }

    private func association(_ object: RoomObject, _ photo: UUID) -> RoomPhotoAssociation {
        RoomPhotoAssociation(sourceId: object.sourceId!, photoId: photo, rect: [0, 0, 0.5, 0.5])
    }

    @Test func countsCoveredAndNamesMissing() {
        let sofa = object("sofa"), tv = object("television"), chairA = object("chair"), chairB = object("chair")
        let photo = UUID()
        let coverage = PhotoCoverage.make(objects: [sofa, tv, chairA, chairB], associations: [association(sofa, photo)],
                                          photoIds: [photo], label: { _ in nil })
        #expect(coverage.covered == 1)
        #expect(coverage.total == 4)
        #expect(coverage.summary == "Photos cover 1 of 4 items — missing: TV, Chair ×2")
    }

    @Test func excludedPhotosDoNotCount() {
        let sofa = object("sofa"), photo = UUID()
        let coverage = PhotoCoverage.make(objects: [sofa], associations: [association(sofa, photo)],
                                          photoIds: [], label: { _ in nil })
        #expect(coverage.covered == 0)
        #expect(coverage.missing == ["Sofa"])
    }

    @Test func userLabelsNameMissingItems() {
        let tv = object("television")
        let coverage = PhotoCoverage.make(objects: [tv], associations: [], photoIds: [], label: { _ in "Big screen" })
        #expect(coverage.missing == ["Big screen"])
    }

    @Test func objectsWithoutScanIdentityAreIgnored() {
        var added = object("sofa")
        added.sourceId = nil
        #expect(PhotoCoverage.make(objects: [added], associations: [], photoIds: [], label: { _ in nil }).summary == nil)
    }

    @Test func completeSummaries() {
        let sofa = object("sofa"), bed = object("bed"), photo = UUID()
        let one = PhotoCoverage.make(objects: [sofa], associations: [association(sofa, photo)],
                                     photoIds: [photo], label: { _ in nil })
        #expect(one.summary == "Photos cover the only item")
        let two = PhotoCoverage.make(objects: [sofa, bed], associations: [association(sofa, photo), association(bed, photo)],
                                     photoIds: [photo], label: { _ in nil })
        #expect(two.summary == "Photos cover all 2 items")
    }
}

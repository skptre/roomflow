import Foundation
import Testing
import simd
@testable import RoomFlow

struct PieceSelectionTests {
    @Test func requiresSelectionAndNeverSubstitutesMissingTarget() {
        let a = UUID(), b = UUID()
        var selection = PieceSelection()
        #expect(selection.finalID(in: [a, b]) == nil)
        selection.select(a)
        #expect(selection.finalID(in: [b]) == nil)
        #expect(selection.finalID(in: [a, b]) == a)
    }
    @Test func permitsOnlySelectedEvidence() {
        let a = UUID(), b = UUID()
        var selection = PieceSelection()
        #expect(!selection.allowsPhoto(for: a))
        selection.select(a)
        #expect(selection.allowsPhoto(for: a))
        #expect(!selection.allowsPhoto(for: b))
    }
}

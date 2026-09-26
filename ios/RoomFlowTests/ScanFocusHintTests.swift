import Foundation
import Testing
@testable import RoomFlow

struct ScanFocusHintTests {
    private func hint(_ shots: Int, newAngle: Bool = false, category: String = "sofa") -> FocusHint {
        FocusHint(objectId: UUID(), category: category, shotsTaken: shots, shotsWanted: 3,
                  dwellProgress: 0, needsNewAngle: newAngle)
    }

    @Test func messages() {
        #expect(ScanFocusHintView.message(for: hint(0)) == "Sofa found — hold steady")
        #expect(ScanFocusHintView.message(for: hint(1, newAngle: true)) == "Sofa: 1 of 3 photos — try another side")
        #expect(ScanFocusHintView.message(for: hint(2)) == "Sofa: 2 of 3 photos — hold steady")
        #expect(ScanFocusHintView.message(for: hint(3)) == "Sofa photographed")
    }

    @Test func displayNames() {
        #expect(ObjectNames.display(category: "television") == "TV")
        #expect(ObjectNames.display(category: "refrigerator") == "Fridge")
        #expect(ObjectNames.display(category: "washerDryer") == "Washer")
        #expect(ObjectNames.display(category: "bathtub") == "Bathtub")
        #expect(ObjectNames.display(category: "someNewThing") == "Some new thing")
    }
}

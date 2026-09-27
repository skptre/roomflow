import Foundation

/// Explicit target identity survives processing. A missing ID always requires a rescan.
nonisolated struct PieceSelection {
    private(set) var selectedID: UUID?
    mutating func select(_ id: UUID) { selectedID = id }
    func allowsPhoto(for id: UUID) -> Bool { selectedID == id }
    func finalID(in ids: [UUID]) -> UUID? {
        guard let selectedID, ids.contains(selectedID) else { return nil }
        return selectedID
    }
}

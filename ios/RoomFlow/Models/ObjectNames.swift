import Foundation

/// Plain names for RoomPlan object categories, for on-screen text only (stored data keeps the category).
nonisolated enum ObjectNames {
    private static let special = ["television": "TV", "refrigerator": "Fridge", "washerDryer": "Washer"]

    /// "television" → "TV"; camel case split into words, first letter capitalized ("someNewThing" → "Some new thing").
    static func display(category: String) -> String {
        if let name = special[category] { return name }
        let words = category.reduce(into: "") { result, character in
            if character.isUppercase, !result.isEmpty { result.append(" ") }
            result.append(character)
        }
        return words.prefix(1).uppercased() + words.dropFirst().lowercased()
    }
}

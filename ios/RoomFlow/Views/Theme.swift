import SwiftUI

extension Color {
    static let rfBackground = Color(red: 0xF5 / 255, green: 0xF1 / 255, blue: 0xE9 / 255)
    static let rfSurface = Color(red: 0xFC / 255, green: 0xFA / 255, blue: 0xF6 / 255)
    static let rfInk = Color(red: 0x49 / 255, green: 0x3C / 255, blue: 0x34 / 255)
    static let rfAccent = Color(red: 0x96 / 255, green: 0x51 / 255, blue: 0x3F / 255)
    static let rfSecondaryText = Color(red: 0x66 / 255, green: 0x5E / 255, blue: 0x55 / 255)
}

/// Full-width rounded button used for primary actions across RoomFlow.
struct RFButtonStyle: ButtonStyle {
    var prominent = true
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .foregroundStyle(prominent ? Color.white : Color.rfInk)
            .background(prominent ? Color.rfAccent : Color.rfSurface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(prominent ? Color.clear : Color.rfInk.opacity(0.16)))
            .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

/// Keep the RoomPlan camera controls legible over live video.
struct RFScanButtonStyle: ButtonStyle {
    var prominent = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .foregroundStyle(prominent ? Color.black : Color.white)
            .background(prominent ? Color(red: 0.91, green: 0.83, blue: 0.62) : Color(white: 0.13),
                        in: RoundedRectangle(cornerRadius: 14))
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

extension Color {
    /// Parses "#RRGGBB" (as stored in `EstimatedColor.hex`).
    init?(hex: String) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        self.init(red: Double((value >> 16) & 0xFF) / 255,
                  green: Double((value >> 8) & 0xFF) / 255,
                  blue: Double(value & 0xFF) / 255)
    }
}

/// Floor-plan colors: the scanned color when we have one, otherwise a neutral stand-in.
enum PlanPalette {
    static let floorFallback = Color(red: 0.79, green: 0.66, blue: 0.51)
    static let wallFallback = Color(red: 0.96, green: 0.94, blue: 0.91)
    static let window = Color(red: 0.55, green: 0.78, blue: 0.91)
    static let selection = Color.accentColor

    static func floor(_ room: RoomModel) -> Color {
        room.floorColor.flatMap { Color(hex: $0.hex) } ?? floorFallback
    }

    static func wall(_ wall: Wall) -> Color {
        wall.estimatedColor.flatMap { Color(hex: $0.hex) } ?? wallFallback
    }

    static func object(_ object: RoomObject) -> Color {
        if let hex = object.estimatedColor?.hex, let color = Color(hex: hex) { return color }
        switch object.category {
        case "bed", "sofa": return Color(red: 0.42, green: 0.47, blue: 0.55)
        case "table": return Color(red: 0.50, green: 0.42, blue: 0.34)
        case "chair": return Color(red: 0.58, green: 0.52, blue: 0.44)
        case "storage": return Color(red: 0.47, green: 0.43, blue: 0.39)
        case "television": return Color(white: 0.22)
        default: return Color(white: 0.55)
        }
    }

    /// Black or white, whichever reads better on the given "#RRGGBB" background.
    static func labelColor(onHex hex: String?) -> Color {
        guard let hex, hex.count == 7, let value = UInt32(hex.dropFirst(), radix: 16) else { return .white }
        let r = Double((value >> 16) & 0xFF), g = Double((value >> 8) & 0xFF), b = Double(value & 0xFF)
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? .black : .white
    }
}

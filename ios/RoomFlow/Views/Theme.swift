import SwiftUI

extension Color {
    /// #151515
    static let rfBackground = Color(red: 0x15 / 255, green: 0x15 / 255, blue: 0x15 / 255)
    static let rfSurface = Color(white: 0.13)
    static let rfSecondaryText = Color.white.opacity(0.6)
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
            .foregroundStyle(prominent ? Color.black : Color.white)
            .background(prominent ? Color.accentColor : Color.rfSurface, in: RoundedRectangle(cornerRadius: 14))
            .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

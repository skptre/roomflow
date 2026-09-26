import SwiftUI

/// Small, non-blocking scan hint for the furniture in view, with a ring that fills as photos are taken.
/// Sits under the top controls so the camera view stays clear.
struct ScanFocusHintView: View {
    let hint: FocusHint
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().stroke(.white.opacity(0.25), lineWidth: 3)
                Circle()
                    .trim(from: 0, to: hint.progress)
                    .stroke(.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                if hint.isComplete {
                    Image(systemName: "checkmark").font(.caption2.bold())
                }
            }
            .frame(width: 22, height: 22)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: hint.progress)
            .accessibilityHidden(true)

            Text(Self.message(for: hint))
                .font(.callout)
                .lineLimit(2)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: Capsule())
        .accessibilityElement(children: .combine)
    }

    /// The hint's text; see the copy table in the plan.
    static func message(for hint: FocusHint) -> String {
        let name = ObjectNames.display(category: hint.category)
        if hint.isComplete { return "\(name) photographed" }
        if hint.shotsTaken == 0 && !hint.needsNewAngle { return "\(name) found — hold steady" }
        let count = "\(hint.shotsTaken) of \(hint.shotsWanted) photos"
        return hint.needsNewAngle ? "\(name): \(count) — try another side" : "\(name): \(count) — hold steady"
    }
}

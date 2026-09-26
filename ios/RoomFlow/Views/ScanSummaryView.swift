import RoomPlan
import SwiftUI

/// Milestone 1 results: what RoomPlan detected. Replaced by RoomEditorView in Milestone 3.
struct ScanSummaryView: View {
    private let summary: ScanSummary

    init(room: CapturedRoom) {
        summary = ScanSummary(room: room)
    }

    var body: some View {
        List {
            Section {
                if let x = summary.footprintX, let z = summary.footprintZ {
                    LabeledContent("Approx. footprint", value: "\(meters(x)) × \(meters(z))")
                }
                if let height = summary.wallHeight {
                    LabeledContent("Wall height", value: meters(height))
                }
            } header: {
                Text("Room")
            } footer: {
                Text("Footprint is measured along the direction you started scanning from, so angled rooms read slightly larger.")
            }

            Section("Structure") {
                LabeledContent("Walls", value: "\(summary.wallCount)")
                LabeledContent("Doors", value: "\(summary.doorCount)")
                LabeledContent("Windows", value: "\(summary.windowCount)")
                LabeledContent("Openings", value: "\(summary.openingCount)")
            }

            Section("Furniture & objects (\(summary.objects.count))") {
                if summary.objects.isEmpty {
                    Text("No objects detected.")
                        .foregroundStyle(Color.rfSecondaryText)
                }
                ForEach(summary.objects) { object in
                    LabeledContent(object.category.capitalized) {
                        Text("\(meters(object.width)) W · \(meters(object.depth)) D · \(meters(object.height)) H")
                            .font(.caption.monospacedDigit())
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.rfBackground)
        .navigationTitle("Scan Result")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func meters(_ value: Float) -> String {
        String(format: "%.2f m", value)
    }
}

import SwiftUI
import UIKit

/// What the scan produced, plus the exact JSON the backend will receive.
/// Replaced by RoomEditorView in Milestone 3.
struct ScanSummaryView: View {
    let room: RoomModel
    /// True for the debug sample room, which must never look like a real scan.
    var isSample = false

    @State private var json = ""
    @State private var didCopy = false

    var body: some View {
        List {
            if isSample {
                Section {
                    Label("Sample room for testing — not a real scan.", systemImage: "flask")
                        .foregroundStyle(.orange)
                }
            }

            Section("Room") {
                LabeledContent("Width", value: meters(room.dimensions.width))
                LabeledContent("Length", value: meters(room.dimensions.length))
                LabeledContent("Height", value: meters(room.dimensions.height))
            }

            Section("Structure") {
                LabeledContent("Walls", value: "\(room.walls.count)")
                LabeledContent("Doors", value: "\(room.doors.count)")
                LabeledContent("Windows", value: "\(room.windows.count)")
                LabeledContent("Openings", value: "\(room.openings.count)")
            }

            Section("Furniture & objects (\(room.objects.count))") {
                if room.objects.isEmpty {
                    Text("No objects detected.")
                        .foregroundStyle(Color.rfSecondaryText)
                }
                ForEach(room.objects) { object in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(object.id).font(.body.monospaced())
                            Spacer()
                            if !object.movable {
                                Text("Fixed").font(.caption).foregroundStyle(Color.rfSecondaryText)
                            }
                        }
                        Text("\(meters(object.dimensions.width)) W · \(meters(object.dimensions.depth)) D · \(meters(object.dimensions.height)) H · \(Int(object.yawDegrees))°")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(Color.rfSecondaryText)
                    }
                }
            }

            Section {
                Button(didCopy ? "Copied" : "Copy JSON", systemImage: didCopy ? "checkmark" : "doc.on.doc") {
                    UIPasteboard.general.string = json
                    didCopy = true
                }
                .disabled(json.isEmpty)
                ShareLink("Share JSON", item: json)
                    .disabled(json.isEmpty)
            } header: {
                Text("Room JSON")
            } footer: {
                Text("\(json.utf8.count.formatted()) bytes · format in docs/room-json.md")
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.rfBackground)
        .navigationTitle(isSample ? "Sample Room" : "Scan Result")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: room) {
            didCopy = false
            json = (try? room.jsonData()).map { String(decoding: $0, as: UTF8.self) } ?? ""
        }
    }

    private func meters(_ value: Double) -> String {
        String(format: "%.2f m", value)
    }
}

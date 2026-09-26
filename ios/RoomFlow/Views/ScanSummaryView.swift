import SwiftUI
import UIKit

/// Room details and the files RoomFlow can hand off.
/// The raw RoomPlan file (for the web importer) and RoomFlow's editable JSON are different artifacts.
struct ScanSummaryView: View {
    let room: RoomModel
    /// True for the debug sample room, which must never look like a real scan.
    var isSample = false
    /// The untouched scan bytes; nil for debug/sample rooms, which have no raw file to export.
    var rawCapture: RawCapture? = nil
    /// Camera colors for `capture`; exported separately in a later step, never inside the raw file.
    var colors: RoomColorEstimates? = nil
    /// Reference photos saved with the scan (empty when photo capture was off).
    var photos: [RoomPhotoEvidence] = []
    /// Candidate photo regions for captured objects (nil for older saved rooms).
    var appearance: RoomAppearanceEvidence? = nil

    @State private var json = ""
    @State private var didCopy = false
    @State private var rawExportURL: URL?
    @State private var rawExportError: String?
    @State private var isShowingRawExportAlert = false

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

            if let rawCapture {
                Section {
                    NavigationLink {
                        RoomEvidenceReviewView(captureID: rawCapture.id, room: room, photos: photos)
                    } label: {
                        Label("Review room", systemImage: "checklist")
                    }
                } footer: {
                    Text("Rename items the scan got wrong and choose which photos to share.")
                }
            }

            if !photos.isEmpty {
                Section {
                    NavigationLink {
                        RoomPhotosView(
                            photos: photos,
                            associations: appearance?.associations ?? [],
                            labels: Dictionary(room.objects.compactMap { o in o.sourceId.map { ($0, o.id) } },
                                               uniquingKeysWith: { first, _ in first })
                        )
                    } label: {
                        Label("Reference photos (\(photos.count))", systemImage: "photo.on.rectangle")
                    }
                }
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

            if rawCapture != nil {
                Section {
                    if let rawExportURL {
                        ShareLink(item: rawExportURL) {
                            Label("Share RoomPlan JSON", systemImage: "square.and.arrow.up")
                        }
                    } else if rawExportError == nil {
                        ProgressView()
                    } else {
                        Button("Retry RoomPlan export", systemImage: "arrow.clockwise", action: makeRawExport)
                    }
                } header: {
                    Text("For the web importer")
                } footer: {
                    Text("Original scan for the web importer: the unmodified RoomPlan file (\(rawExportURL?.lastPathComponent ?? "<room>.roomplan.json")).")
                }
            }

            Section {
                Button(didCopy ? "Copied" : "Copy Editable Room JSON", systemImage: didCopy ? "checkmark" : "doc.on.doc") {
                    UIPasteboard.general.string = json
                    didCopy = true
                }
                .disabled(json.isEmpty)
                ShareLink("Share Editable Room JSON", item: json)
                    .disabled(json.isEmpty)
            } header: {
                Text("RoomFlow editable room")
            } footer: {
                Text("RoomFlow's current floor plan, not the web import file. \(json.utf8.count.formatted()) bytes · format in docs/room-json.md")
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
        .onAppear {
            if rawExportURL == nil { makeRawExport() }
        }
        .alert("Couldn't create the RoomPlan file", isPresented: $isShowingRawExportAlert) {
            Button("Retry", action: makeRawExport)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(rawExportError ?? "")
        }
    }

    /// Writes the raw file once for this screen. A failure leaves the room and editor untouched.
    private func makeRawExport() {
        guard let rawCapture else { return }
        rawExportError = nil
        do {
            rawExportURL = try RoomPlanFileExport.export(rawCapture)
        } catch {
            rawExportError = error.localizedDescription
            isShowingRawExportAlert = true
        }
    }

    private func meters(_ value: Double) -> String {
        String(format: "%.2f m", value)
    }
}

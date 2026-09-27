import SwiftUI
import UIKit

struct PieceReviewView: View {
    let piece: ScannedPiece
    var isSaved = false
    @State private var name = ""
    @State private var width = ""
    @State private var height = ""
    @State private var depth = ""
    @State private var includePhotos = false
    @State private var shareURL: URL?
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        Form {
            Section("Your piece") {
                TextField("Name", text: $name)
                Text(ObjectNames.display(category: piece.category))
                Text("Approximate preview · measured dimensions. Photos do not reconstruct unseen surfaces.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Dimensions in meters") {
                dimension("Width", text: $width)
                dimension("Height", text: $height)
                dimension("Depth", text: $depth)
                Text("Check these measurements. Any correction is recorded as supplied by you.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("Reference views") {
                if piece.photos.isEmpty {
                    Text("No reference photos. You can still save the measured piece.")
                } else {
                    ScrollView(.horizontal) {
                        HStack {
                            ForEach(Array(piece.photos.enumerated()), id: \.offset) { _, photo in
                                if let data = Data(base64Encoded: photo.data), let image = UIImage(data: data) {
                                    Image(uiImage: image).resizable().scaledToFit().frame(width: 170, height: 180)
                                }
                            }
                        }
                    }
                    Toggle("Include these photos in saved and shared file", isOn: $includePhotos)
                    Text("Photos may include surroundings. They are processed on this phone. Only sharing the file sends them elsewhere.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Section {
                Button(saving ? "Saving…" : "Save Piece") { Task { await save() } }.disabled(saving)
                if let shareURL {
                    Label("Saved on this phone", systemImage: "checkmark.circle")
                    ShareLink(item: shareURL) { Label("Share Piece File", systemImage: "square.and.arrow.up") }
                    Text("In Roomflow on the web, open Your room → Import a scanned piece to add it to your existing room.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let error { Text(error).foregroundStyle(.red) }
            }
        }
        .navigationTitle("Review Piece")
        .onAppear {
            includePhotos = isSaved && !piece.photos.isEmpty
            name = piece.name
            width = String(piece.dimensions.width)
            height = String(piece.dimensions.height)
            depth = String(piece.dimensions.depth)
            if isSaved {
                Task { shareURL = try? await PieceArchiveStore.shared.url(for: piece) }
            }
        }
        .onChange(of: name) { _, _ in shareURL = nil }
        .onChange(of: width) { _, _ in shareURL = nil }
        .onChange(of: height) { _, _ in shareURL = nil }
        .onChange(of: depth) { _, _ in shareURL = nil }
        .onChange(of: includePhotos) { _, _ in shareURL = nil }
    }

    private func dimension(_ label: String, text: Binding<String>) -> some View {
        HStack { Text(label); Spacer(); TextField(label, text: text).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
    }

    private func save() async {
        guard let w = Double(width), let h = Double(height), let d = Double(depth) else {
            error = "Enter valid measurements in meters, using a decimal point."; return
        }
        var saved = piece
        saved.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        saved.dimensions = .init(width: w, height: h, depth: d,
                                 source: w == piece.dimensions.width && h == piece.dimensions.height && d == piece.dimensions.depth
                                    ? piece.dimensions.source : "user")
        if !includePhotos { saved.photos = [] }
        saving = true
        do {
            shareURL = try await PieceArchiveStore.shared.save(saved)
            error = nil
        } catch { self.error = "Couldn't save this piece: \(error.localizedDescription). Your review is still here; try again." }
        saving = false
    }
}

struct SavedPiecesView: View {
    @State private var pieces: [ScannedPiece] = []
    @State private var error: String?
    var body: some View {
        List {
            if let error { Text(error); Button("Retry") { Task { await load() } } }
            if pieces.isEmpty && error == nil { Text("Saved pieces will appear here, ready to share again.") }
            ForEach(pieces) { piece in
                NavigationLink(piece.name) { PieceReviewView(piece: piece, isSaved: true) }
            }
        }
        .navigationTitle("Saved Pieces")
        .task { await load() }
    }
    private func load() async {
        do { pieces = try await PieceArchiveStore.shared.list(); error = nil }
        catch { self.error = "Couldn't open your pieces: \(error.localizedDescription)" }
    }
}

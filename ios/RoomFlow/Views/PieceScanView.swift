import RoomPlan
import SwiftUI

/// Furniture capture uses RoomPlan only for measurement; no room geometry is saved or shared.
struct PieceScanView: View {
    var capturePhotos: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var scanner = RoomScanService()
    @State private var piece: ScannedPiece?
    @State private var error: String?
    @State private var preparing = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if RoomScanService.isSupported {
                RoomCaptureViewContainer(captureView: scanner.captureView)
                    .id(ObjectIdentifier(scanner)).ignoresSafeArea()
            }
            VStack(spacing: 16) {
                HStack {
                    Button("Cancel") { dismiss() }
                        .padding().background(.ultraThinMaterial, in: Capsule())
                    Spacer()
                }
                Spacer()
                if scanner.state == .scanning {
                    if let hint = scanner.focusHint, scanner.pieceSelection.selectedID != nil, capturePhotos {
                        ScanFocusHintView(hint: hint)
                    }
                    Text(instruction)
                        .multilineTextAlignment(.center)
                        .padding().background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                    if scanner.pieceSelection.selectedID == nil {
                        Button { scanner.selectFramedPiece() } label: {
                            Image(systemName: "scope").font(.system(size: 42))
                                .frame(width: 84, height: 84)
                                .background(.ultraThinMaterial, in: Circle())
                                .overlay(Circle().stroke(.white, lineWidth: 3))
                        }
                        .accessibilityLabel("Select framed piece")
                        .disabled(scanner.focusHint == nil)
                    } else {
                        if capturePhotos { Text("\(scanner.piecePhotoCount) of 3 reference views saved") }
                        Button("Review Piece") { scanner.finish() }.buttonStyle(RFButtonStyle())
                        Button("Choose a different piece") { restart() }
                            .padding(10).background(.ultraThinMaterial, in: Capsule())
                    }
                } else if scanner.state == .processing || preparing {
                    ProgressView("Measuring your piece…").padding().background(.ultraThinMaterial, in: Capsule())
                } else if case .failed(let failure) = scanner.state {
                    Text(failure.message).padding().background(.ultraThinMaterial)
                    Button("Close") { dismiss() }.buttonStyle(RFButtonStyle())
                }
                if let error {
                    Text(error).padding().background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                    Button("Scan Again") { restart() }.buttonStyle(RFButtonStyle())
                }
            }.padding(24)
        }
        .task { await start() }
        .onChange(of: scanner.state) { _, state in
            if state == .finished { preparePiece() }
        }
        .sheet(item: $piece) { piece in
            NavigationStack {
                PieceReviewView(piece: piece)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            }
            .interactiveDismissDisabled()
        }
        .onDisappear {
            scanner.cancel()
            discardTemporaryPhotos()
        }
    }

    private func restart() {
        scanner.cancel()
        discardTemporaryPhotos()
        scanner = RoomScanService()
        error = nil
        Task { await start() }
    }

    private func discardTemporaryPhotos() {
        Set(scanner.photos.map(\.sessionID)).forEach { RoomEvidenceRecorder.removeTemporaryFiles(sessionID: $0) }
    }

    private var instruction: String {
        if scanner.pieceSelection.selectedID == nil {
            return scanner.focusHint.map { "\(ObjectNames.display(category: $0.category)) found. Tap the target to select it." }
                ?? "Frame one piece of furniture and hold steady until it is detected."
        }
        if !capturePhotos { return "Piece selected. Review its measured dimensions when ready." }
        if scanner.piecePhotoCount >= 3 { return "Three views saved. Ready to review your piece." }
        return scanner.focusHint == nil
            ? "Bring your selected piece fully into view. Step back if its edges are cut off."
            : "Keep the whole piece in frame. Hold steady, then move around it for another angle."
    }

    private func start() async {
        scanner.mode = .piece
        scanner.capturePhotos = capturePhotos
        await scanner.start()
    }

    private func preparePiece() {
        guard let room = scanner.capturedRoom else { return }
        let converted = RoomPlanConverter.convert(room, colors: scanner.colorEstimates)
        guard let id = scanner.pieceSelection.finalID(in: converted.objects.compactMap(\.sourceId)),
              let object = converted.objects.first(where: { $0.sourceId == id }) else {
            error = "The selected piece could not be matched after processing. Scan it again so we can confirm its measurements."
            return
        }
        preparing = true
        do {
            let photos = try scanner.photos.filter { $0.focusObjectId == id && $0.trackingContinuous }.prefix(3)
                .map { try ScannedPiece.photo(from: $0) }
            piece = ScannedPiece(id: UUID().uuidString, name: ObjectNames.display(category: object.category),
                                 category: object.category,
                                 dimensions: .init(width: object.dimensions.width, height: object.dimensions.height,
                                                   depth: object.dimensions.depth, source: "captured"),
                                 color: object.estimatedColor?.hex, photos: photos)
        } catch {
            // Measurements remain recoverable when optional photo preparation fails.
            piece = ScannedPiece(id: UUID().uuidString, name: ObjectNames.display(category: object.category),
                                 category: object.category,
                                 dimensions: .init(width: object.dimensions.width, height: object.dimensions.height,
                                                   depth: object.dimensions.depth, source: "captured"),
                                 color: object.estimatedColor?.hex)
            self.error = "Reference photos could not be prepared. Your measurements are still available."
        }
        preparing = false
    }
}

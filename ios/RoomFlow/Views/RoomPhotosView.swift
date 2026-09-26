import SwiftUI
import UIKit

/// The reference photos saved with a room.
///
/// Files are stored in the camera sensor's landscape orientation (their calibration describes
/// those exact pixels), so they're rotated here for display only, to match how the phone was held.
struct RoomPhotosView: View {
    let photos: [RoomPhotoEvidence]
    /// Candidate object regions per photo (sensor-orientation, normalized).
    var associations: [RoomPhotoAssociation] = []
    /// RoomPlan source UUID → readable object ID such as "table-2".
    var labels: [UUID: String] = [:]

    @State private var selected: RoomPhotoEvidence?
    @State private var showRegions = true

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 8)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                    Button { selected = photo } label: {
                        SensorPhoto(url: photo.fileURL)
                            .frame(height: 150)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(alignment: .bottomLeading) {
                                if !photo.trackingContinuous {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .foregroundStyle(.yellow)
                                        .padding(6)
                                        .accessibilityLabel("Tracking was interrupted after this photo")
                                }
                            }
                    }
                    .accessibilityLabel("Reference photo \(index + 1) of \(photos.count)")
                }
            }
            .padding(12)

            Text("Photos help recreate how things look. They don't change the room's measurements.")
                .font(.footnote)
                .foregroundStyle(Color.rfSecondaryText)
                .padding(.horizontal, 16)
        }
        .background(Color.rfBackground)
        .navigationTitle("Reference Photos")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selected) { photo in
            NavigationStack {
                VStack(spacing: 12) {
                    SensorPhoto(url: photo.fileURL, regions: showRegions ? regions(for: photo) : [])
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    Toggle("Show object regions", isOn: $showRegions)
                        .padding(.horizontal)
                    Text(regionNote(for: photo))
                        .font(.caption)
                        .foregroundStyle(Color.rfSecondaryText)
                        .padding(.horizontal)
                }
                .padding(.bottom)
                .background(Color.black)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { selected = nil }
                    }
                }
            }
        }
    }

    private func regions(for photo: RoomPhotoEvidence) -> [PhotoRegion] {
        associations.filter { $0.photoId == photo.id && $0.rect.count == 4 }.map {
            PhotoRegion(label: labels[$0.sourceId] ?? "object", sensorRect: $0.rect)
        }
    }

    private func regionNote(for photo: RoomPhotoEvidence) -> String {
        if !photo.trackingContinuous { return "Tracking was interrupted after this photo, so objects aren't matched to it." }
        let count = regions(for: photo).count
        return count == 0
            ? "No scanned objects fall inside this photo."
            : "Boxes show where \(count) scanned object\(count == 1 ? "" : "s") should appear, from the room's measurements. Something in front may hide them."
    }
}

private struct PhotoRegion: Identifiable {
    let id = UUID()
    let label: String
    /// Normalized [x, y, w, h] in sensor orientation.
    let sensorRect: [Double]

    /// The same box after the photo is rotated 90° clockwise for display.
    var displayRect: CGRect {
        let (x, y, w, h) = (sensorRect[0], sensorRect[1], sensorRect[2], sensorRect[3])
        return CGRect(x: 1 - y - h, y: x, width: h, height: w)
    }
}

/// Shows a sensor-orientation JPEG rotated upright for a phone held in portrait,
/// optionally with object regions drawn on top.
private struct SensorPhoto: View {
    let url: URL?
    var regions: [PhotoRegion] = []

    var body: some View {
        if let url, let cgImage = UIImage(contentsOfFile: url.path)?.cgImage {
            // `.right` = rotate 90° clockwise: the back camera's sensor is landscape.
            Image(uiImage: UIImage(cgImage: cgImage, scale: 1, orientation: .right))
                .resizable()
                .scaledToFit()
                .overlay {
                    GeometryReader { geometry in
                        ForEach(regions) { region in
                            let r = region.displayRect
                            let frame = CGRect(x: r.minX * geometry.size.width, y: r.minY * geometry.size.height,
                                               width: r.width * geometry.size.width, height: r.height * geometry.size.height)
                            Rectangle()
                                .stroke(Color.accentColor, lineWidth: 2)
                                .frame(width: frame.width, height: frame.height)
                                .overlay(alignment: .topLeading) {
                                    Text(region.label)
                                        .font(.caption2.monospaced())
                                        .padding(.horizontal, 4)
                                        .background(Color.accentColor)
                                        .foregroundStyle(.black)
                                }
                                .position(x: frame.midX, y: frame.midY)
                        }
                    }
                    .accessibilityHidden(true)
                }
        } else {
            ZStack {
                Color.rfSurface
                Image(systemName: "photo")
                    .foregroundStyle(Color.rfSecondaryText)
            }
            .accessibilityLabel("Photo unavailable")
        }
    }
}

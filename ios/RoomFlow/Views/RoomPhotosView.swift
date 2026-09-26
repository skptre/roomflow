import SwiftUI
import UIKit

/// The reference photos saved with a room.
///
/// Files are stored in the camera sensor's landscape orientation (their calibration describes
/// those exact pixels), so they're rotated here for display only, to match how the phone was held.
struct RoomPhotosView: View {
    let photos: [RoomPhotoEvidence]

    @State private var selected: RoomPhotoEvidence?

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
                SensorPhoto(url: photo.fileURL)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { selected = nil }
                        }
                    }
            }
        }
    }
}

/// Shows a sensor-orientation JPEG rotated upright for a phone held in portrait.
private struct SensorPhoto: View {
    let url: URL?

    var body: some View {
        if let url, let cgImage = UIImage(contentsOfFile: url.path)?.cgImage {
            // `.right` = rotate 90° clockwise: the back camera's sensor is landscape.
            Image(uiImage: UIImage(cgImage: cgImage, scale: 1, orientation: .right))
                .resizable()
                .scaledToFit()
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

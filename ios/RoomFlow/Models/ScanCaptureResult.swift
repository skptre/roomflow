import Foundation
import RoomPlan

/// Everything one finished scan produced. The capture is the measured evidence; colors, photos, and
/// wall art are optional appearance evidence that never changes it.
struct ScanCaptureResult {
    let room: CapturedRoom
    let colors: RoomColorEstimates
    /// Reference photos chosen during the scan; empty when photo capture was off or produced nothing.
    let photos: [RoomPhotoEvidence]
    /// Confirmed wall art detected during the scan; empty when photo capture was off or none was confirmed.
    let wallArt: [WallArtItem]
    /// Directory holding `wallArt`'s cropped reference photos (`<id>.jpg`); nil when photo capture was off.
    let wallArtDirectory: URL?

    init(room: CapturedRoom, colors: RoomColorEstimates, photos: [RoomPhotoEvidence],
         wallArt: [WallArtItem] = [], wallArtDirectory: URL? = nil) {
        self.room = room
        self.colors = colors
        self.photos = photos
        self.wallArt = wallArt
        self.wallArtDirectory = wallArtDirectory
    }
}

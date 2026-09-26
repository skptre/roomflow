import RoomPlan

/// Everything one finished scan produced. The capture is the measured evidence; colors and
/// photos are optional appearance evidence that never changes it.
struct ScanCaptureResult {
    let room: CapturedRoom
    let colors: RoomColorEstimates
    /// Reference photos chosen during the scan; empty when photo capture was off or produced nothing.
    let photos: [RoomPhotoEvidence]
}

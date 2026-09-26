import Testing
@testable import RoomFlow

/// Proves the test bundle can reach the app's pure model code without RoomPlan hardware.
struct RoomFlowTests {
    @Test func sampleRoomBuildsWithoutLiDAR() {
        let room = SampleRoom.make()
        #expect(room.walls.count == 4)
        #expect(!room.objects.isEmpty)
    }
}

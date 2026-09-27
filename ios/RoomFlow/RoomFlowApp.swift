import SwiftUI

@main
struct RoomFlowApp: App {
    @StateObject private var pairing = BrowserPairingManager()
    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(pairing)
        }
    }
}

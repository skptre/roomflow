import Foundation
import Testing
@testable import RoomFlow

struct BrowserPairingTests {
    private let secret = String(repeating: "a", count: 32)

    @Test func acceptsSecureAndLocalConnections() {
        let secure = "roomflow://pair?server=https%3A%2F%2Froomflow.example&session=\(secret)&token=\(secret)"
        #expect(BrowserPairing.parse(secure)?.displayHost == "roomflow.example")
        let local = "roomflow://pair?server=http%3A%2F%2F192.168.1.8%3A5173&session=\(secret)&token=\(secret)"
        #expect(BrowserPairing.parse(local)?.displayHost == "192.168.1.8")
    }

    @Test func rejectsUntrustedEndpointsAndMalformedTokens() {
        #expect(BrowserPairing.parse("roomflow://pair?server=http%3A%2F%2Fevil.example&session=\(secret)&token=\(secret)") == nil)
        #expect(BrowserPairing.parse("roomflow://pair?server=https%3A%2F%2Froomflow.example&session=short&token=\(secret)") == nil)
    }
}

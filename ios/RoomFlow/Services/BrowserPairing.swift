import Foundation
import Combine

/// A one-use browser session scanned from Roomflow's QR code.
struct BrowserPairing: Equatable {
    let server: URL
    let session: String
    let uploadToken: String

    var displayHost: String {
        guard let host = server.host else { return "browser" }
        return server.port.map { "\(host):\($0)" } ?? host
    }

    static func parse(_ text: String) -> BrowserPairing? {
        guard let code = URLComponents(string: text), code.scheme == "roomflow", code.host == "pair",
              let items = code.queryItems,
              let serverText = items.first(where: { $0.name == "server" })?.value,
              let session = items.first(where: { $0.name == "session" })?.value,
              let token = items.first(where: { $0.name == "token" })?.value,
              validSecret(session), validSecret(token),
              let server = URL(string: serverText), let host = server.host,
              server.user == nil, server.password == nil,
              server.path.isEmpty || server.path == "/",
              server.query == nil, server.fragment == nil,
              server.scheme == "https" || (server.scheme == "http" && privateIPv4(host))
        else { return nil }
        return BrowserPairing(server: server, session: session, uploadToken: token)
    }

    private static func validSecret(_ value: String) -> Bool {
        value.count >= 24 && value.count <= 128 &&
            value.utf8.allSatisfy { byte in
                (65...90).contains(byte) || (97...122).contains(byte) ||
                    (48...57).contains(byte) || byte == 45 || byte == 95
            }
    }

    private static func privateIPv4(_ host: String) -> Bool {
        let parts = host.split(separator: ".").compactMap { UInt8($0) }
        guard parts.count == 4 else { return false }
        return parts[0] == 10 || (parts[0] == 172 && (16...31).contains(parts[1])) ||
            (parts[0] == 192 && parts[1] == 168)
    }
}

@MainActor
final class BrowserPairingManager: ObservableObject {
    enum TransferState: Equatable {
        case idle, connected, sending, sent(String), failed(String)
    }

    @Published private(set) var pairing: BrowserPairing?
    @Published private(set) var transfer: TransferState = .idle

    func connect(_ code: BrowserPairing) {
        pairing = code
        transfer = .connected
    }

    func send(_ rawData: Data) async {
        guard let pairing else { return }
        transfer = .sending
        do {
            var request = URLRequest(url: pairing.server.appendingPathComponent("api/pairings/\(pairing.session)"))
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(pairing.uploadToken)", forHTTPHeaderField: "Authorization")
            request.timeoutInterval = 45
            let (_, response) = try await URLSession.shared.upload(for: request, from: rawData)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                transfer = .failed("The browser did not accept this scan. Check that its pairing code is still open, then try again.")
                return
            }
            transfer = .sent(pairing.displayHost)
            self.pairing = nil
        } catch {
            transfer = .failed("Could not reach the browser. Keep this scan and try again when both devices are connected.")
        }
    }
}

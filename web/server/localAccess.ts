import type { IncomingMessage } from 'node:http'

/** Accepts requests only through this machine's loopback interface and host. */
export function isLocalPeerRequest(req: IncomingMessage): boolean {
  const host = req.headers.host ?? ''
  const peer = req.socket.remoteAddress
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '')
}

/** Accepts a local peer only when its browser Origin matches the served host. */
export function isLocalBrowserRequest(req: IncomingMessage): boolean {
  return isLocalPeerRequest(req) && req.headers.origin === `http://${req.headers.host}`
}

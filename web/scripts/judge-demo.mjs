import { writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { preview } from 'vite'

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)

function option(name) {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  if (!args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error(`${name} needs a value`)
  }
  return args[index + 1]
}

function isPrivateIPv4(address) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
}

function lanAddresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((entry) => entry.family === 'IPv4' && !entry.internal && isPrivateIPv4(entry.address))
      .map((entry) => ({ name, address: entry.address })),
  )
}

function escapeHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

async function joinPage(addresses, port) {
  const cards = await Promise.all(addresses.map(async ({ name, address }) => {
    const url = `http://${address}:${port}/`
    const qr = await QRCode.toString(url, { type: 'svg', width: 280, margin: 2, errorCorrectionLevel: 'M' })
    return `<article><div class="qr">${qr}</div><h2>${escapeHtml(name)}</h2><a href="${url}">${url}</a></article>`
  }))

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Join Roomflow</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f0e9;color:#29251f;font:16px/1.5 system-ui,sans-serif}
  main{max-width:1100px;margin:auto;padding:36px 24px 60px}h1{font-size:clamp(2.4rem,5vw,4rem);line-height:1.05;margin:8px 0 16px}
  p{max-width:750px}.cards{display:flex;flex-wrap:wrap;gap:20px;margin-top:30px}article{background:#fff;padding:22px;border-radius:18px;box-shadow:0 4px 22px #0001;min-width:310px;text-align:center}
  .qr svg{width:280px;height:280px;max-width:100%}h2{font-size:1rem;margin:12px 0 3px}a{color:#185b4a;overflow-wrap:anywhere;font-weight:700}
  .note{margin-top:30px;color:#5c554d} @media print{body{background:white}article{box-shadow:none;border:1px solid #ddd}}
</style></head><body><main><p>ROOMFLOW · JUDGE DEMO</p><h1>Step into your next room.</h1>
<p>Connect your phone to the same Wi-Fi or laptop hotspot as this computer, then scan the QR code for that network. Each phone opens its own Roomflow session.</p>
<div class="cards">${cards.join('')}</div>
<p class="note">Keep the laptop awake and this terminal running. If a phone cannot connect, try the other QR code, allow Node.js on Windows Private networks, or use the laptop hotspot. Start with the labeled sample room; a saved RoomPlan JSON can also be imported.</p>
</main></body></html>`
}

async function main() {
  const requestedAddress = option('--address')
  const portValue = option('--port') ?? '4173'
  const port = Number(portValue)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be a number from 1024 to 65535')

  const candidates = lanAddresses()
  const addresses = requestedAddress
    ? candidates.filter((candidate) => candidate.address === requestedAddress)
    : candidates
  if (addresses.length === 0) {
    throw new Error(requestedAddress
      ? `${requestedAddress} is not a private IPv4 address on this laptop. Available: ${candidates.map(({ address }) => address).join(', ') || 'none'}`
      : 'No private network address found. Connect the laptop to Wi-Fi or turn on its hotspot, then try again.')
  }

  await writeFile(join(webRoot, 'dist', 'join.html'), await joinPage(addresses, port))
  const server = await preview({ root: webRoot, preview: { host: '0.0.0.0', port, strictPort: true } })
  console.log(`\nShow this page on the laptop: http://localhost:${port}/join.html`)
  for (const { name, address } of addresses) console.log(`Phone URL (${name}): http://${address}:${port}/`)
  console.log('Keep this terminal open. Press Ctrl+C when judging is over.\n')
  const shutdown = () => server.httpServer.close()
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error(`Judge demo could not start: ${error.message}`)
  process.exitCode = 1
})

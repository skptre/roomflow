# Judge demo on a laptop

This serves the built web app to phones on the laptop's local network. Each judge gets an independent browser session; there is no shared room or live phone pairing. The sample room is ready to explore, and a saved RoomPlan JSON can be imported. A live scan is not needed for the demo.

## Before judging

Use the branch you want to demonstrate. On the laptop, install dependencies once:

```powershell
cd web
npm ci
```

Connect the laptop and judges' phones to the same Wi-Fi network, or have them join the laptop's hotspot. Keep the laptop plugged in and awake. Test with an actual phone before the event.

## Start and share

From `web/` run:

```powershell
npm run judge
```

The command builds the app, starts it on port 4173, and prints `http://localhost:4173/join.html`. Open that page on the laptop and show its QR code. If multiple network interfaces appear, use the code for the Wi-Fi or hotspot the judges joined. Leave the terminal open until judging ends; press Ctrl+C to stop.

The QR page also prints each phone URL. To show only one interface, run `npm run judge -- --address 192.168.x.x` with the laptop's actual address. Use `--port 4180` if 4173 is in use, but any firewall rule must match the chosen port.

## If a phone cannot connect

Confirm the phone is on the same network and can open the printed `http://` URL directly. Allow the Node.js network prompt for **Private networks** on Windows. Some guest Wi-Fi networks isolate devices; use a laptop hotspot if that happens. Make sure a VPN is not routing the phone away from the laptop. Product photos and retailer price refresh may need internet, while the bundled catalog and room demo do not.

The page is a temporary local-network demo, not an internet deployment. Only share the QR code on the judging network. Room edits remain in each browser's local session; exporting or importing a scan is a separate action.

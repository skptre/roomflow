# Direct scan handoff

Roomflow can open a native RoomPlan scan in a waiting browser without exporting a file.

1. Run the web app with `cd web && npm run dev` (or `npm run preview` after a build). Both scripts listen on the local network.
2. On the browser landing page choose **Open my scan**. Leave the code visible.
3. In the installed iPhone app choose **Connect to browser**, scan the code, and confirm the browser host shown on the phone.
4. Scan the room. Once RoomPlan finishes processing and the scan is saved on the phone, the original RoomPlan JSON is sent to that browser and opened there. From a saved room, use **Room details → Connect to browser** instead.

The iPhone and browser must reach the same server. On a computer with multiple network interfaces, set `ROOMFLOW_PAIR_ORIGIN` to the reachable `http://<private-LAN-IP>:<port>` or an HTTPS origin. For an HTTPS deployment, run Roomflow's API with the site; a static-only Vite deployment cannot receive scans.

Each code has separate random upload and browser tokens, expires after 30 minutes, accepts one validated scan up to 20 MB, and keeps the raw bytes only in server memory until the browser closes the pairing or it expires. A failed transfer leaves the phone's saved scan available for retry. **Use a saved scan file** remains available in the browser as a fallback.

Simulator tests can check the pairing parser and app navigation. A compatible physical iPhone is required to verify LiDAR capture and camera scanning. A real phone and computer on the same network are required for the final transfer check.

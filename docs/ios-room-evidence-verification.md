# iOS room evidence — verification report

Plan: `docs/superpowers/plans/2026-09-26-ios-room-evidence-handoff.md` (Task 6).
Records what was actually checked, on what, and what is still open. No room photos, scan payloads,
or private details are included; identifiers are shortened.

## Environment

| Item | Value |
| --- | --- |
| App commit | `c298eb6` on `keshav-ios` (pushed) |
| Physical device | iPhone 15 Pro (iPhone16,1), LiDAR — iOS version: _fill in (Settings › General › About)_ |
| Mac / Xcode | macOS 27.0, Xcode 27.0 |
| Simulator | iPhone 18 Pro, iOS 27.0 runtime (24A434) |
| Web importer | `origin/feat/web-pr6-catalog` — **not yet run against these files** |

## Automated checks (2026-09-26, at `c298eb6`)

| Command | Result |
| --- | --- |
| `xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test` | Pass — 38 tests in 7 suites |
| `xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build` | Pass |

Suites: smoke, raw file export, archive store (atomic save, failed write, staging leftovers, photos,
appearance), evidence recorder (limits, busy drop, cancel/late completion, stale session, encode failure,
tracking interruption), projector (center, rotation, non-square, behind camera, near plane, clipping,
outside, non-finite, orientation independence, associations), selection, package (byte-identical raw,
photo selection, geometry-only, hashes vs. independent unzip, invalid paths, archive failure, fresh package).
Simulator results do not prove LiDAR capture.

## Physical-device results (iPhone 15 Pro)

| Area | What was done | Result |
| --- | --- | --- |
| Capture | Scanned rooms from Xcode | Works. Early crash traced to Xcode's Metal API Validation tripping on a RealityKit texture bug; disabled in the shared scheme |
| Scan smoothness with photos | Scan with "Include reference photos" on | User reports smooth |
| Save / reopen | Scan → Saved Rooms → reopen | Listed as "Scan and photos"; reopens without rescanning |
| Raw export | Share RoomPlan JSON → AirDrop | Valid: 46,804 B compact JSON; top-level `walls/doors/windows/openings/objects` plus `floors`, `sections`, `coreModel`, `referenceOriginTransform`, `story`, `version`; **no top-level `identifier`**; transforms flat 16 column-major; categories keyed (`{"door":{"isOpen":false}}`); confidence keyed; all finite; all upright |
| Photo display | Reference photos grid / full view | Upright (portrait-held scans) |
| Object ↔ photo regions | "Show object regions" on a real photo | Boxes landed on a scanned bin (`storage`) and a lounge chair (`sofa`) |
| Photo exclusion | Review room: 12 photos, 1 left out | Package contained 11, `omittedPhotoCount` 0 — excluded photo absent |
| Room package | Prepare → Share → AirDrop zip | Opens with macOS `unzip`; single `<capture-id>.roomflow/` folder; inventory exact (15 files); all SHA-256 and sizes match; 11 JPEGs 1280×960 matching manifest; intrinsics plausible (fx≈918, cx≈641, cy≈479); 6 associations, all to shared photos and real RoomPlan objects; 1 tracking-interrupted photo with no associations |
| Photo metadata | Inspected exported JPEGs | No GPS, device make/model, or date; only ImageIO's pixel-dimension EXIF tags |
| Region correctness | Independent Python recomputation of every object × photo | 0 mismatches with the app |

## Findings

1. **RoomPlan coverage is by category.** Small items (a bin, a wipes box) were missed or labeled generically
   (`storage`). Expected: RoomPlan detects ~16 furniture/fixture categories. Review room lets the user add a
   name beside the scan label; no geometry is invented.
2. **Photo coverage can be one-sided.** In one scan, 8 objects were detected but only 2 appeared in any kept
   photo; the TV and 5 sofas were behind the camera in every usable photo. Not a matching error (confirmed by
   recomputation). Mitigation now: turn a full 360° while scanning. Possible later change: direction-aware photo
   selection.
3. **Raw RoomPlan JSON lacks a top-level `identifier`.** The capture ID travels in the file name and in the
   package manifest. Documented in `docs/ios-room-package.md`.

## Still unverified

| Item | Why it matters | How to check |
| --- | --- | --- |
| Web import of the raw `.roomplan.json` | The handoff that matters today | Yash imports the unchanged AirDropped file on `feat/web-pr6-catalog`; record importer commit, warnings, scale |
| One tape-measured wall vs. imported length | Scale sanity (±3 cm target) | Measure one wall, compare with the importer; record both numbers |
| Landscape-held scan | Region math and display rotation were only exercised in portrait | Scan holding the phone sideways; check photos display and region boxes |
| Reopen after force-quit with photos | Durable save of photo rooms | Swipe the app away, relaunch, open the photo room, view photos and regions |
| Raw re-export hash on device | Original bytes unchanged after reopening | Reopen a saved room, share RoomPlan JSON, compare its SHA-256 with an earlier export of the same room (byte-identical was verified in the Simulator) |
| Cancel during processing / background mid-scan | No stale photos attached to a later room | Cancel after Done Scanning; background the app while scanning; then scan again and check Saved Rooms |
| Save / export failure on device | Recovery paths | Hard to force on device (low storage); covered by unit tests only |
| VoiceOver order, large text in Review room | Accessibility requirements | Turn on VoiceOver and the largest text size; walk through Review room |
| Package consumer | The package format is only proposed | Designer side agrees `docs/ios-room-package.md`, then imports a package |

No Designer/Gemini recognition, shopping, or certified fit is claimed by any result above.

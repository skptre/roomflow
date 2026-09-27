# iOS Capture, Handoff, and Editor MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver a demoable native iOS flow that captures a LiDAR room, shares the unmodified RoomPlan capture with the web workspace, lets the user edit scanned movable furniture in a top-down plan, and exports the resulting editable state without building the backend.

**Architecture:** Preserve two representations from every successful scan. CapturedRoom is immutable source evidence and is exported as Apple JSON for the web importer. RoomModel remains the separate, normalized, mutable iOS editor model. Camera-derived colors are optional evidence in a separate sidecar; they must never be inserted into the raw RoomPlan file.

**Tech Stack:** Swift 5, SwiftUI, RoomPlan, ARKit, AVFoundation, Foundation, a native unit-test bundle, and the existing React/TypeScript web importer as an external consumer.

**Spec:** spec.md, docs/room-json.md, the user-owned product note, and docs/contracts/room-import.md on origin/feat/web-pr6-catalog (web-owned; do not edit without Yash's agreement).

## Global Constraints

- Target a LiDAR-equipped iPhone on iOS 17.0 or later; the Simulator may compile and exercise synthetic data, but cannot verify RoomPlan capture.
- Keep dependencies native and minimal. Do not add a backend, a cloud account, API keys, or a third-party scanning SDK.
- Keep the raw RoomPlan export exactly JSONEncoder().encode(capturedRoom): no wrapper, transform change, unit conversion, recentering, rotation, color field, or synthetic marker.
- Use meters and RoomPlan UUIDs as the cross-platform source identity. Use the raw RoomPlan/native frame for any future web-to-iOS layout response.
- Preserve CapturedRoom separately from RoomModel; native edits must never mutate the original capture.
- Do not modify web code or docs/contracts/room-import.md unless the web owner explicitly requests the change.
- Do not include real scans, AR frames, API keys, signing files, or build products in Git. Keep the current uncommitted RoomColorSampler.swift sampling tweak isolated until it has been tested on a physical phone.
- Do not push or merge main automatically. Keep the work on keshav-ios and make one coherent commit per completed task.
- Product/catalog recognition, brand matching, product pricing, cloud persistence, and AI design generation are outside this MVP. Do not represent approximate color or RoomPlan category detection as exact furniture identity.

## Review Focus

- A shared file must remain valid raw RoomPlan JSON and retain a .roomplan.json filename; the web importer must not see the iOS-normalized RoomModel instead.
- A cancelled share, failed file write, or optional color-export failure must retain the processed scan and leave the editor usable.
- Fixed RoomPlan fixtures (toilet, sink, stove, and the existing fixture list) must be selectable but never draggable, rotatable, or deletable.
- Dragging or rotating a selected object must keep its full rotated footprint inside the editor bounds and retain its dimensions, sourceId, color evidence, and category.
- A web optimization result with the wrong room ID, stale revision, unsupported coordinate space, unknown UUID, or non-finite pose must be rejected without changing the local editor.

## Scope and Milestone Order

1. Establish a reproducible local build and test target.
2. Export the raw capture to the exact file format the web importer consumes; verify one genuine scan on a LiDAR phone.
3. Add the native editable operations that the demo promises: select, drag, rotate, delete, and restore.
4. Export the editable native model and optional camera-color sidecar as clearly distinct artifacts.
5. Lock a narrow, future web-to-iOS optimization contract and add only a mock client seam, not a production backend client.
6. Run a cross-device end-to-end handoff rehearsal and prepare the demo script.

The stop line for the 36-hour demo is the end of Task 4. Tasks 5 and 6 start only if the raw handoff and editor work on a physical phone.

## Planned File Structure

| Path | Responsibility |
| --- | --- |
| ios/RoomFlow/Services/RoomPlanFileExport.swift | Writes a named raw .roomplan.json file from CapturedRoom; owns only the immediate share-file lifecycle. |
| ios/RoomFlow/Models/RoomAppearanceSidecar.swift | Codable optional color evidence keyed by RoomPlan UUID; no geometry or product claims. |
| ios/RoomFlow/Services/EditableRoomFileExport.swift | Writes a named .roomflow.json file from the native RoomModel. |
| ios/RoomFlow/Services/FloorPlanGeometry.swift | Adds pure rotated-footprint clamping used by editor state. |
| ios/RoomFlow/Services/RoomEditorState.swift | Owns selection, drag lifecycle, committed revision increments, rotation, deletion, and restore. |
| ios/RoomFlow/Views/HomeView.swift | Retains the raw capture and its color estimates for the lifetime of the open editor. |
| ios/RoomFlow/Views/RoomEditorView.swift | Connects canvas gestures and explicit action controls to RoomEditorState; passes raw capture to the details view. |
| ios/RoomFlow/Views/ScanSummaryView.swift | Clearly offers separate raw RoomPlan, editable RoomFlow, and optional appearance files, with visible errors. |
| ios/RoomFlow/Models/OptimizationContract.swift | Future-only Codable request/response and validation types for native-coordinate layout patches. |
| ios/RoomFlow/Services/RoomOptimizationService.swift | Protocol and deterministic mock; no URL, key, or production HTTP endpoint. |
| ios/RoomFlowTests | Pure geometry, editor-state, sidecar, export-file, and contract-validation tests. |
| docs/room-json.md | Documents the editable native JSON, not the web import artifact. |
| docs/ios-web-handoff.md | Documents exact artifacts, ownership, validation procedure, and future response contract. |

## Task 1: Establish an iOS Build and Test Baseline

**Files:**
- Create: ios/RoomFlowTests/RoomFlowTests.swift and the RoomFlowTests unit-test target through Xcode.
- Modify: ios/RoomFlow.xcodeproj/project.pbxproj only through Xcode's test-target UI if it does not use a synchronized test folder.
- Do not modify: ios/RoomFlow/Services/RoomColorSampler.swift.

**Interfaces:**
- Consumes: the existing RoomFlow app target.
- Produces: a test bundle able to import @testable import RoomFlow and a documented build command for later tasks.

- [ ] **Step 1: Inspect the current target and available simulators**

Run xcodebuild -list -project ios/RoomFlow.xcodeproj and xcrun simctl list devices available.

Expected: one RoomFlow application target and at least one runnable iPhone Simulator; absence of a test target is acceptable before this task.

- [ ] **Step 2: Add the RoomFlowTests unit-test bundle in Xcode**

Use File > New > Target > Unit Testing Bundle. Name it RoomFlowTests, target the existing RoomFlow app, and leave the application target's bundle ID, team, and deployment target unchanged.

- [ ] **Step 3: Add a smoke test**

Construct SampleRoom.make() in a debug build and assert it has four walls and at least one object. This proves test code can access the existing pure-model fixture without RoomPlan hardware.

- [ ] **Step 4: Run the test bundle and signing-free build**

Run:
~~~
xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'platform=iOS Simulator,name=<available iPhone>' test
xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -sdk iphoneos CODE_SIGNING_ALLOWED=NO build
~~~

Expected: both commands exit 0. If the installed Simulator name differs, use that exact name; do not claim a physical RoomPlan scan passed.

- [ ] **Step 5: Commit the isolated test setup**

~~~bash
git add ios/RoomFlow.xcodeproj ios/RoomFlowTests
git commit -m "test(ios): add RoomFlow unit test target"
~~~

## Task 2: Export Raw RoomPlan Files for the Web Importer

**Files:**
- Create: ios/RoomFlow/Services/RoomPlanFileExport.swift.
- Create: ios/RoomFlowTests/RoomPlanFileExportTests.swift.
- Modify: ios/RoomFlow/Views/HomeView.swift.
- Modify: ios/RoomFlow/Views/RoomEditorView.swift.
- Modify: ios/RoomFlow/Views/ScanSummaryView.swift.

**Interfaces:**
- Consumes: CapturedRoom held as HomeView.latestCapture and the existing RoomModel.
- Produces: RoomPlanFileExport.export(_:directory:) throws -> URL, where the URL ends with .roomplan.json and points to raw JSONEncoder output.

- [ ] **Step 1: Write failing pure file-export tests**

Test RoomPlanFileExport.fileName(roomID:) and a package-visible write(data:roomID:directory:) helper. Assert the generated filename ends in .roomplan.json, the output is located in the supplied temporary directory, and rereading the file returns exactly the input bytes. Also assert a write into an unavailable directory reports an error rather than replacing any source file.

- [ ] **Step 2: Run the focused test before implementation**

Run:
~~~
xcodebuild -project ios/RoomFlow.xcodeproj -scheme RoomFlow -destination 'platform=iOS Simulator,name=<available iPhone>' test -only-testing:RoomFlowTests/RoomPlanFileExportTests
~~~

Expected: FAIL because RoomPlanFileExport does not exist.

- [ ] **Step 3: Implement RoomPlanFileExport**

Implement:
~~~swift
enum RoomPlanFileExport {
    static func fileName(roomID: UUID) -> String
    static func write(data: Data, roomID: UUID, directory: URL) throws -> URL
    static func export(_ capture: CapturedRoom, directory: URL = FileManager.default.temporaryDirectory) throws -> URL
}
~~~

export must call the default JSONEncoder().encode(capture) and delegate to write. Create only a scoped RoomFlowExports temporary directory. Do not use RoomModel.jsonEncoder, do not pretty-print or sort keys, and do not place app metadata around the encoded capture.

- [ ] **Step 4: Pass the raw capture through navigation**

Keep HomeView.latestCapture as the authoritative untouched capture. Add a separate stored latestColorEstimates value when a scan completes. Extend RoomEditorView and ScanSummaryView initializers with optional raw-capture and color-estimate parameters so debug/sample rooms still work with nil raw export.

- [ ] **Step 5: Add the raw-file share action**

In ScanSummaryView, create the temporary raw file once for the displayed capture, retain its URL in view state, and show ShareLink(item: rawExportURL) labelled **Share RoomPlan JSON**. On an encoding/write failure, show a visible alert with a retry action; do not clear room, latestCapture, or the editor.

Rename the existing text share action to **Share Editable Room JSON**. It remains a native editor/debug representation, not the web handoff.

- [ ] **Step 6: Run unit and compile verification**

Run the focused export test, the entire RoomFlowTests bundle, and the signing-free iphoneos build from Task 1.

Expected: all exit 0; the test proves file bytes and extension, not that a LiDAR scan is available on a Simulator.

- [ ] **Step 7: Perform the physical handoff test**

On a LiDAR iPhone, scan one ordinary room, finish processing, open the details screen, and share **RoomPlan JSON** via AirDrop or Files. Confirm the filename ends in .roomplan.json, the raw file is non-empty, and its JSON has top-level walls, doors, windows, openings, and objects where RoomPlan supplied them. Give the exact unchanged file to Yash for import; do not add it to Git.

- [ ] **Step 8: Commit only the raw-export feature**

~~~bash
git add ios/RoomFlow/Services/RoomPlanFileExport.swift ios/RoomFlow/Views/HomeView.swift ios/RoomFlow/Views/RoomEditorView.swift ios/RoomFlow/Views/ScanSummaryView.swift ios/RoomFlowTests/RoomPlanFileExportTests.swift
git commit -m "feat(ios): export raw RoomPlan capture files"
~~~

## Task 3: Implement Reliable Native Furniture Editing

**Files:**
- Modify: ios/RoomFlow/Services/FloorPlanGeometry.swift.
- Modify: ios/RoomFlow/Services/RoomEditorState.swift.
- Modify: ios/RoomFlow/Views/RoomEditorView.swift.
- Create: ios/RoomFlowTests/FloorPlanGeometryTests.swift.
- Create: ios/RoomFlowTests/RoomEditorStateTests.swift.

**Interfaces:**
- Consumes: RoomModel, RoomObject, and FloorPlanGeometry.footprint(of:).
- Produces: a mutable editor state with beginDrag, dragSelected, endDrag, rotateSelectedClockwise, removeSelected, and restoreOriginal; fixed objects leave state unchanged.

- [ ] **Step 1: Write failing geometry tests for rotated bounds clamping**

Use SampleRoom.make() and a synthetic object at 0, 90, and 45 degrees. For each case, request a center beyond all four room edges, then assert every returned footprint corner is within 0...room.dimensions.width and 0...room.dimensions.length. Assert a valid interior position is returned unchanged.

- [ ] **Step 2: Implement FloorPlanGeometry.clampedCenter(for:proposed:in:) -> FloorPoint**

Compute the candidate’s rotated footprint, calculate the smallest X/Z translation that brings all corners inside the axis-aligned normalized room bounds, and return the translated center. This MVP intentionally does not reject collisions or model irregular floor polygons; add no collision heuristic that pretends to be reliable.

- [ ] **Step 3: Write failing editor-state tests**

Cover these cases with SampleRoom data plus a test-only fixed fixture:

- a tap selects the smallest overlapping object;
- a drag updates only the selected movable object and increments room.revision once when ended;
- a fixed fixture is selectable but drag, rotate, and delete leave it unchanged;
- rotate changes only yaw by +90 degrees modulo 360 and clamps the result inside bounds;
- delete removes only the selected movable object and clears selection;
- restore returns exactly to originalRoom and clears selection.

- [ ] **Step 4: Implement the editor-state command surface**

Add:
~~~swift
@discardableResult func beginDrag(at point: FloorPoint, hitSlop: Double) -> Bool
func dragSelected(to point: FloorPoint)
func endDrag()
@discardableResult func rotateSelectedClockwise() -> Bool
@discardableResult func removeSelected() -> Bool
func restoreOriginal()
~~~

Store finger-to-object-center offset at beginDrag so furniture does not jump beneath the finger. Update the editor model live during drag, use clampedCenter, and increment revision only in endDrag if position changed. Rotation and deletion increment revision once. Preserve all object identity/provenance fields; do not edit originalRoom.

- [ ] **Step 5: Replace the canvas tap-only interaction**

In RoomEditorView, use a zero-distance DragGesture to select on touch-down, drag a movable selection with the converted FloorPlanTransform point, and commit in onEnded. A touch that does not move still selects. Do not combine a competing onTapGesture and drag recognizer.

Add bottom-panel controls for **Rotate 90°**, **Delete**, and **Restore scan**. Disable move/rotate/delete for fixtures, explain that the item is fixed, and confirm deletion in an alert. Keep a selected-object card and make action labels accessible.

- [ ] **Step 6: Run focused tests, full tests, and compile checks**

Run each new test class, then the full RoomFlowTests bundle and signing-free iPhone build. Expected: all exit 0.

- [ ] **Step 7: Test the gesture flow on a physical iPhone**

Use both a real scan and the debug sample. Verify selection, drag near each boundary, 90-degree rotation near a boundary, delete, fixed-fixture protection, restore, and details JSON revision changes. Record any RoomPlan detection issue separately from editor behavior.

- [ ] **Step 8: Commit the editor feature**

~~~bash
git add ios/RoomFlow/Services/FloorPlanGeometry.swift ios/RoomFlow/Services/RoomEditorState.swift ios/RoomFlow/Views/RoomEditorView.swift ios/RoomFlowTests/FloorPlanGeometryTests.swift ios/RoomFlowTests/RoomEditorStateTests.swift
git commit -m "feat(ios): edit scanned furniture in floor plan"
~~~

## Task 4: Separate Editable State and Optional Appearance Evidence

**Files:**
- Create: ios/RoomFlow/Models/RoomAppearanceSidecar.swift.
- Create: ios/RoomFlow/Services/EditableRoomFileExport.swift.
- Modify: ios/RoomFlow/Views/ScanSummaryView.swift.
- Modify: docs/room-json.md.
- Create: docs/ios-web-handoff.md.
- Create: ios/RoomFlowTests/RoomAppearanceSidecarTests.swift.

**Interfaces:**
- Consumes: RoomModel, RoomColorEstimates, raw CapturedRoom.identifier, and the current editable revision.
- Produces: named .roomflow.json editable files and optional .appearance.json files, each explicitly distinct from raw .roomplan.json.

- [ ] **Step 1: Write a failing sidecar encoding test**

Define an AppearanceEntry with sourceId: UUID and color: EstimatedColor. Encode a RoomAppearanceSidecar with two entries and a floor color, decode it, and assert UUIDs, hex values, and sample counts round-trip. Assert no geometry, category, brand, product, or price field exists in the encoded data.

- [ ] **Step 2: Implement sidecar model and editable file exporter**

Create:
~~~swift
struct RoomAppearanceSidecar: Codable, Equatable {
    var schemaVersion: Int
    var roomIdentifier: UUID
    var elements: [AppearanceEntry]
    var floor: EstimatedColor?
}

struct AppearanceEntry: Codable, Equatable {
    var sourceId: UUID
    var color: EstimatedColor
}
~~~

EditableRoomFileExport must use RoomModel.jsonData() and write <room-id>.roomflow.json. The sidecar uses <capture-id>.appearance.json. Skip the appearance share action when no color samples meet the current sampling threshold; a failed sidecar must not block raw or editable exports.

- [ ] **Step 3: Make share actions unambiguous**

On the details screen, show this order and copy:

1. **Share RoomPlan JSON** — “Original scan for the web importer.”
2. **Share Editable Room JSON** — “RoomFlow’s current edited floor plan.”
3. **Share Appearance JSON** — “Approximate camera colors; optional.”

Share named files, not strings. Retain generated URLs for the screen’s lifetime and surface file-generation failures with a retry.

- [ ] **Step 4: Document ownership and data claims**

Update docs/room-json.md to say it documents the editable native model, not the raw web-import file. Write docs/ios-web-handoff.md with exact filenames, identifier mapping, meter units, coordinate ownership, sidecar semantics, the no-real-scan-in-Git rule, and a one-wall tape-measure validation checklist. Link to the web-owned import contract instead of duplicating or changing it.

- [ ] **Step 5: Verify exports and a real-phone transfer**

Run the sidecar test and full test suite. On a physical scan, share all available files; verify the raw file imports in Yash’s web branch, the editable file decodes with RoomModel.jsonDecoder, and the sidecar UUIDs refer only to raw RoomPlan identifiers. Do not claim camera colors are material or brand matches.

- [ ] **Step 6: Commit documentation and separate exports**

~~~bash
git add ios/RoomFlow/Models/RoomAppearanceSidecar.swift ios/RoomFlow/Services/EditableRoomFileExport.swift ios/RoomFlow/Views/ScanSummaryView.swift ios/RoomFlowTests/RoomAppearanceSidecarTests.swift docs/room-json.md docs/ios-web-handoff.md
git commit -m "feat(ios): separate editable and appearance exports"
~~~

## Task 5: Lock the Future Optimization Boundary Without Building the Backend

**Files:**
- Create: ios/RoomFlow/Models/OptimizationContract.swift.
- Create: ios/RoomFlow/Services/RoomOptimizationService.swift.
- Create: ios/RoomFlowTests/OptimizationContractTests.swift.
- Modify: docs/ios-web-handoff.md.

**Interfaces:**
- Consumes: raw capture ID, editable room revision, and a user prompt.
- Produces: a future-safe, mockable service seam. It does not make network requests until Yash confirms the endpoint, authentication, upload format, and response schema.

- [ ] **Step 1: Agree the contract with the web owner before writing the model**

Record this decision in the handoff document and obtain Yash’s confirmation:
~~~json
{
  "schemaVersion": 1,
  "coordinateSpace": "roomplan-native-v1",
  "baseRoomIdentifier": "RoomPlan UUID",
  "baseRevision": 3,
  "objectPatches": [
    { "sourceId": "RoomPlan object UUID", "operation": "move", "center": [1.2, 0.4, -0.8], "yawRadians": 1.5708 }
  ],
  "explanation": "Moved the chair away from the door."
}
~~~

For this first contract, only move and remove patches for scanned movable objects are in scope. Added products, product offers, collisions, and prices are deferred.

- [ ] **Step 2: Write failing validation tests for bad responses**

Test a valid same-room/same-revision move, then reject unsupported coordinate space, mismatched room ID, stale base revision, unknown source UUID, fixed-object movement, non-finite center values, and non-finite yaw. Every rejection must leave the original RoomModel unchanged.

- [ ] **Step 3: Implement the models, validator, and mock service**

Define RoomCoordinateSpace.roomPlanNativeV1, RoomOptimizationRequest, RoomObjectPatch, RoomOptimizationResponse, and RoomOptimizationService in the named files:
~~~swift
protocol RoomOptimizationService {
    func optimize(_ request: RoomOptimizationRequest) async throws -> RoomOptimizationResponse
}
~~~

Provide MockRoomOptimizationService only. It returns a deterministic, valid empty-patch response with a clear explanation. Do not add URLSession, a base URL, a secret, or a production endpoint until the backend owner supplies a tested API contract.

- [ ] **Step 4: Run contract tests and document result application**

Run the focused contract test and full suite. Update docs/ios-web-handoff.md: web code may normalize for rendering, but any response to iOS is converted back to roomplan-native-v1; iOS validates it and converts it to its local RoomModel frame only after validation.

- [ ] **Step 5: Commit only the mock boundary**

~~~bash
git add ios/RoomFlow/Models/OptimizationContract.swift ios/RoomFlow/Services/RoomOptimizationService.swift ios/RoomFlowTests/OptimizationContractTests.swift docs/ios-web-handoff.md
git commit -m "feat(ios): define mock optimization contract"
~~~

## Task 6: Rehearse the Cross-Platform Demo and Hand Off Cleanly

**Files:**
- Modify: docs/ios-web-handoff.md only to record verified device/import facts.
- Do not commit: real room captures, sidecars tied to a real capture, screenshots containing private room details, or Xcode user data.

**Interfaces:**
- Consumes: a LiDAR iPhone, one safe non-private room, the raw exporter, the native editor, and Yash’s current importer branch.
- Produces: a verified demo path and an integration handoff message with the exact commit SHA and test evidence.

- [ ] **Step 1: Run the complete physical-device script**

1. Launch RoomFlow on the LiDAR iPhone and accept camera access.
2. Scan a room completely and wait for RoomPlan’s final processing state.
3. Open the floor plan; select, drag, rotate, delete, and restore a movable detected object.
4. Open details and share raw RoomPlan JSON.
5. Import that exact file into Yash’s web workspace.
6. Compare one tape-measured wall against the web result; record measured length, imported length, and tolerance result (target plus or minus 3 cm) without committing the scan.
7. Optionally share editable and appearance files to demonstrate the separation.

- [ ] **Step 2: Diagnose failures at the correct owner boundary**

If capture fails, record device model/iOS version, permission state, and RoomPlan error. If raw export fails, retain the capture and inspect the file writer. If web import fails, give Yash the unmodified file, exact importer error, and importer commit SHA; do not “fix” it by altering RoomPlan transforms on the phone.

- [ ] **Step 3: Publish only reviewed source changes**

Check git status -sb and git diff --check. Ensure only intended files are staged and the pre-existing color-sampler tweak is either separately tested/committed or left unstaged. Push only keshav-ios after the user approves the reviewed commits.

- [ ] **Step 4: Send teammate handoff note**

Include: iOS branch/commit SHA, raw export filename convention, confirmation the file is untouched CapturedRoom JSON, physical device/iOS version, one measured-wall result, any importer warning/error, and the statement that appearance is optional sidecar data.

## Deferred Backlog (Do Not Start Before the Demo Works)

- Saved-room persistence and document import/export UI.
- Merchant/product catalog, price tracking, retailer links, and product identity/variant models.
- Brand or visual furniture recognition: return candidates with confidence and evidence; never overwrite measured RoomPlan geometry or present a guess as a match.
- AR product preview, photorealistic meshes, Object Capture, or third-party image-to-3D services.
- Collision/pathfinding/accessibility analysis beyond explicit, validated requirements.
- Production URLSession client, authentication, upload retrying, and cloud storage.
- Applying web optimization patches in the iOS UI; complete it only after a real endpoint and native-coordinate contract are confirmed.

## Final Verification Checklist

- [ ] The project and unit tests build without signing.
- [ ] A LiDAR phone completes a real RoomPlan scan; the Simulator is not used as evidence for capture.
- [ ] Share RoomPlan JSON produces an unmodified named .roomplan.json file that the web importer accepts.
- [ ] The iOS floor plan displays walls/openings/objects and allows only movable furniture to be selected, dragged, rotated, deleted, and restored.
- [ ] Raw capture, editable room state, and optional appearance evidence are three distinct artifacts with clear user-facing labels.
- [ ] No private capture, credentials, user-specific Xcode state, or build artifact is committed.
- [ ] The final demo script has one recorded physical-device/import rehearsal and an honest list of anything not verified.

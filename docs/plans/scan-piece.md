# Scan a piece implementation plan

Approved direction: dedicated iOS mode, tap a circular target to select furniture, collect multiple views, review dimensions, export only that piece, then preview/add it to the existing web room. This first version uses RoomPlan detection and approximate authored shapes, not photogrammetric reconstruction. Photos stay local until deliberately exported or analyzed.

## Contract
`*.roomflow-piece.json`: `{format:"roomflow-piece",version:1,id:string,name:string,category:string,dimensions:{width:number,height:number,depth:number,source:"captured"|"user"|"estimated"},color?:"#rrggbb",photos:[{mimeType:"image/jpeg",data:string}]}`. Dimensions are positive finite meters; no world pose or room geometry. At most 3 upright metadata-stripped JPEGs, each <=1,500,000 decoded bytes; entire JSON <=7 MB. Empty photos allowed. No inferred price/link. Maximum dimension 20 m. ID is stable for duplicate warning; each placement gets a fresh room-object ID.

## Tasks
- Native: add Scan a piece from Home, reuse live RoomPlan capture with explicit target lock and selected-object-only focused photos. Never silently substitute a final object when selected ID disappears. Let user explicitly choose/confirm final object if needed. Review name/dimensions/photos before local save/export, retain successful exports for retry. Tests selection/export validation. Build device and simulator tests when available.
- Web: strict bounded piece parser, map scan categories to authored approximate assets (unknown => labeled placeholder), no AI attribution for deterministic mapping. Import from Your room, preview in free space without replacing room, duplicate notice, stale revision rejection, cancel/undo restores geometry and financial state. Photos displayed locally, no cloud transfer. Tests malformed imports, size/photo bounds, placement, money, cancellation and stale revisions.
- Verify: project records, all web checks, native build/test, independent review. Keep physical-device capture claims explicitly unverified.

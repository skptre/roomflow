# Scanned piece package v1

Separate from `.roomflow.zip`: a `.roomflow-piece.json` describes one user-selected furniture item, not a room. Importing it must never call `loadRoom` or reuse its capture position. The Designer chooses a fresh bottom-center pose in the current room and preserves the package ID separately from its fresh placement ID.

```json
{
  "format": "roomflow-piece",
  "version": 1,
  "id": "stable-capture-id",
  "name": "My chair",
  "category": "chair",
  "dimensions": { "width": 0.75, "height": 0.9, "depth": 0.8, "source": "captured" },
  "color": "#b7afa5",
  "photos": []
}
```

This example is synthetic. Dimensions are positive finite meters, at most 20 m each. Source is `captured`, `user`, or `estimated`; editing measurements records `user`. `color` is optional; omit when unavailable. Names are nonblank and at most 120 characters; category at most 80; ID at most 100. Unknown categories remain size placeholders, never invented product models.

Photos are at most three `{ "mimeType": "image/jpeg", "data": "<base64>" }` records. Export upright JPEG pixels without EXIF/location metadata, each at most 1,500,000 bytes. The whole UTF-8 document is at most 7,000,000 bytes. Browser validation bounds decoded dimensions to 4096 per edge and 16 million pixels. Native exports target at most 1024 pixels on the long edge. No camera/world transforms, room geometry, merchant identity, price, or external URLs are included.

Review controls sharing of photos. Saving and exporting are local operations; importing does not call Gemini. A category-based asset is approximate and must not be attributed to AI. Price starts unknown, unless marked owned (no new cost). Duplicate imports show an explicit copy notice. Previews are revision-bound and isolated; one undo removes the added object and its financial effect together.

This is a new contract for the user-approved Scan a piece feature; existing room/RoomPlan contracts remain unchanged. Physical-device validation is required for target lock, final identity retention, focus photos and camera orientation.

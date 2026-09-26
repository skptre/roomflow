import SwiftUI

/// Top-down floor plan of a room: walls, doors, windows, and furniture drawn to scale
/// in their scanned colors. Tap furniture to select it.
struct RoomEditorView: View {
    @State private var editor: RoomEditorState
    private let isSample: Bool
    /// The untouched scan bytes this room came from; nil for debug/sample rooms.
    private let rawCapture: RawCapture?
    private let colors: RoomColorEstimates?
    private let photos: [RoomPhotoEvidence]
    private let appearance: RoomAppearanceEvidence?

    init(room: RoomModel, isSample: Bool = false, rawCapture: RawCapture? = nil,
         colors: RoomColorEstimates? = nil, photos: [RoomPhotoEvidence] = [],
         appearance: RoomAppearanceEvidence? = nil) {
        _editor = State(initialValue: RoomEditorState(room: room))
        self.isSample = isSample
        self.rawCapture = rawCapture
        self.colors = colors
        self.photos = photos
        self.appearance = appearance
    }

    var body: some View {
        GeometryReader { proxy in
            let transform = FloorPlanTransform(room: editor.room.dimensions, viewSize: proxy.size)
            Canvas { context, _ in
                FloorPlanRenderer(room: editor.room, selectedID: editor.selectedObjectID, transform: transform)
                    .draw(in: &context)
            }
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { location in
                // ~12 pt of slack around each footprint so small chairs are easy to hit.
                editor.select(at: transform.toRoom(location), margin: 12 / transform.scale)
            }
            .overlay(alignment: .bottomLeading) {
                ScaleBar(pointsPerMeter: transform.scale).padding(12)
            }
            .accessibilityElement()
            .accessibilityLabel("Floor plan, \(editor.room.objects.count) objects")
        }
        .background(Color.rfBackground)
        .safeAreaInset(edge: .bottom) { bottomPanel }
        .navigationTitle(isSample ? "Sample Room" : "Your Room")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    ScanSummaryView(room: editor.room, isSample: isSample, rawCapture: rawCapture, colors: colors, photos: photos,
                                    appearance: appearance)
                } label: {
                    Label("Room details and JSON", systemImage: "list.bullet.rectangle")
                }
            }
        }
    }

    @ViewBuilder
    private var bottomPanel: some View {
        VStack(spacing: 8) {
            if isSample {
                Label("Sample room — not a real scan", systemImage: "flask")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            if let object = editor.selectedObject {
                SelectedObjectCard(object: object) { editor.selectedObjectID = nil }
            } else {
                Text("Tap furniture to select it")
                    .font(.footnote)
                    .foregroundStyle(Color.rfSecondaryText)
                    .padding(.vertical, 12)
            }
        }
        // Fixed height: showing or hiding the card must not re-fit (and visibly jump) the plan.
        .frame(height: 124, alignment: .bottom)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }
}

// MARK: - Drawing

/// Draws the plan into a Canvas. Order: floor, grid, furniture (largest first), walls, openings.
private struct FloorPlanRenderer {
    let room: RoomModel
    let selectedID: String?
    let transform: FloorPlanTransform

    func draw(in context: inout GraphicsContext) {
        let floor = floorPath()
        context.fill(floor, with: .color(PlanPalette.floor(room)))
        drawGrid(clippedTo: floor, in: context)

        let byArea = room.objects.sorted {
            $0.dimensions.width * $0.dimensions.depth > $1.dimensions.width * $1.dimensions.depth
        }
        for object in byArea {
            drawObject(object, in: &context)
        }
        for object in byArea {
            drawLabel(object, in: &context)
        }

        for wall in room.walls {
            var line = Path()
            line.move(to: transform.toView(wall.start))
            line.addLine(to: transform.toView(wall.end))
            context.stroke(line, with: .color(PlanPalette.wall(wall)), style: StrokeStyle(lineWidth: 5, lineCap: .round))
        }

        for window in room.windows {
            let line = segment(window.start, window.end)
            context.stroke(line, with: .color(PlanPalette.window), lineWidth: 5)
            context.stroke(line, with: .color(.white.opacity(0.9)), lineWidth: 1)
        }
        // Doors and open doorways: a gap in the wall with small end marks.
        // Swing direction isn't known from the scan, so no door arc is drawn.
        for opening in room.doors + room.openings {
            context.stroke(segment(opening.start, opening.end), with: .color(PlanPalette.floor(room)), lineWidth: 7)
            drawJambs(opening, in: context)
        }
    }

    private func floorPath() -> Path {
        var path = Path()
        if let outline = FloorPlanGeometry.outline(of: room.walls) {
            path.addLines(outline.map(transform.toView))
            path.closeSubpath()
        } else {
            let origin = transform.toView(FloorPoint(x: 0, z: 0))
            path.addRect(CGRect(x: origin.x, y: origin.y,
                                width: room.dimensions.width * transform.scale,
                                height: room.dimensions.length * transform.scale))
        }
        return path
    }

    /// Faint 1 m grid so sizes read at a glance.
    private func drawGrid(clippedTo floor: Path, in context: GraphicsContext) {
        var grid = Path()
        for x in stride(from: 1.0, to: room.dimensions.width, by: 1) {
            grid.move(to: transform.toView(FloorPoint(x: x, z: 0)))
            grid.addLine(to: transform.toView(FloorPoint(x: x, z: room.dimensions.length)))
        }
        for z in stride(from: 1.0, to: room.dimensions.length, by: 1) {
            grid.move(to: transform.toView(FloorPoint(x: 0, z: z)))
            grid.addLine(to: transform.toView(FloorPoint(x: room.dimensions.width, z: z)))
        }
        var clipped = context
        clipped.clip(to: floor)
        clipped.stroke(grid, with: .color(.white.opacity(0.07)), lineWidth: 0.5)
    }

    private func drawObject(_ object: RoomObject, in context: inout GraphicsContext) {
        var shape = Path()
        shape.addLines(FloorPlanGeometry.footprint(of: object).map(transform.toView))
        shape.closeSubpath()

        let isSelected = object.id == selectedID
        context.fill(shape, with: .color(PlanPalette.object(object)))
        if isSelected {
            context.stroke(shape, with: .color(PlanPalette.selection), style: StrokeStyle(lineWidth: 3, lineJoin: .round))
        } else {
            // Dashed outline marks RoomPlan's low-confidence detections.
            let dash: [CGFloat] = object.confidence == "low" ? [4, 3] : []
            context.stroke(shape, with: .color(.black.opacity(0.45)), style: StrokeStyle(lineWidth: 1, lineJoin: .round, dash: dash))
        }
    }

    private func drawLabel(_ object: RoomObject, in context: inout GraphicsContext) {
        // Label only when the footprint is big enough on screen to fit text.
        let shortSide = min(object.dimensions.width, object.dimensions.depth) * transform.scale
        let longSide = max(object.dimensions.width, object.dimensions.depth) * transform.scale
        if shortSide > 22, longSide > 44 {
            let label = Text(object.category.capitalized)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(PlanPalette.labelColor(onHex: object.estimatedColor?.hex))
            context.draw(label, at: transform.toView(FloorPoint(x: object.position.x, z: object.position.z)))
        }
    }

    private func drawJambs(_ opening: WallOpening, in context: GraphicsContext) {
        let dx = opening.end.x - opening.start.x, dz = opening.end.z - opening.start.z
        let length = max(hypot(dx, dz), 0.001)
        // Perpendicular to the wall, 0.12 m each side.
        let nx = -dz / length * 0.12, nz = dx / length * 0.12
        var marks = Path()
        for point in [opening.start, opening.end] {
            marks.move(to: transform.toView(FloorPoint(x: point.x - nx, z: point.z - nz)))
            marks.addLine(to: transform.toView(FloorPoint(x: point.x + nx, z: point.z + nz)))
        }
        context.stroke(marks, with: .color(PlanPalette.wallFallback), lineWidth: 2)
    }

    private func segment(_ a: FloorPoint, _ b: FloorPoint) -> Path {
        var path = Path()
        path.move(to: transform.toView(a))
        path.addLine(to: transform.toView(b))
        return path
    }
}

// MARK: - Overlays

private struct ScaleBar: View {
    let pointsPerMeter: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("1 m").font(.caption2).foregroundStyle(Color.rfSecondaryText)
            Rectangle()
                .fill(Color.rfSecondaryText)
                .frame(width: pointsPerMeter, height: 2)
        }
        .accessibilityHidden(true)
    }
}

private struct SelectedObjectCard: View {
    let object: RoomObject
    let onDismiss: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 6)
                .fill(PlanPalette.object(object))
                .frame(width: 36, height: 36)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(.white.opacity(0.2)))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(object.category.capitalized).font(.headline)
                    Text(object.id).font(.caption.monospaced()).foregroundStyle(Color.rfSecondaryText)
                }
                Text(String(format: "%.2f W × %.2f D × %.2f H m", object.dimensions.width, object.dimensions.depth, object.dimensions.height))
                    .font(.caption.monospacedDigit())
                Text(details)
                    .font(.caption)
                    .foregroundStyle(Color.rfSecondaryText)
            }
            Spacer()
            Button("Deselect", systemImage: "xmark", action: onDismiss)
                .labelStyle(.iconOnly)
                .foregroundStyle(Color.rfSecondaryText)
        }
        .padding(14)
        .background(Color.rfSurface, in: RoundedRectangle(cornerRadius: 14))
    }

    private var details: String {
        var parts = ["\(object.confidence.capitalized) confidence"]
        switch object.estimatedColor?.sampleCount {
        case nil: parts.append("color not captured")
        case 0: parts.append("illustrative color")
        default: parts.append("color from camera")
        }
        if !object.movable { parts.append("fixed") }
        return parts.joined(separator: " · ")
    }
}

import ARKit
import Foundation
import RoomPlan
import simd

/// Camera colors per scanned element, keyed by RoomPlan identifier.
nonisolated struct RoomColorEstimates {
    var byElement: [UUID: EstimatedColor] = [:]
    var floor: EstimatedColor? = nil

    static let none = RoomColorEstimates()
}

/// Estimates the real colors of walls, floor, and furniture.
///
/// RoomPlan only reports geometry. During the scan this keeps small, downscaled copies of
/// camera frames (in memory only). After the final room arrives, it projects points on each
/// surface into those frames, uses LiDAR depth to skip pixels where something else is in
/// the way, and takes the median color. Results are approximate: lighting affects them.
final class RoomColorSampler {
    private var frames: [ColorFrame] = []
    private let maxFrames = 160
    private let thumbnailWidth = 160

    func reset() {
        frames.removeAll()
    }

    func capture(_ frame: ARFrame) {
        guard let colorFrame = ColorFrame(frame: frame, width: thumbnailWidth) else { return }
        if frames.count >= maxFrames {
            // Thin out evenly so early and late parts of the scan stay covered.
            frames = frames.enumerated().filter { $0.offset.isMultiple(of: 2) }.map(\.element)
        }
        frames.append(colorFrame)
    }

    func estimate(for room: CapturedRoom) -> RoomColorEstimates {
        var result = RoomColorEstimates()
        guard !frames.isEmpty else { return result }

        for wall in room.walls {
            result.byElement[wall.identifier] = median(of: wallPoints(wall))
        }
        for object in room.objects {
            result.byElement[object.identifier] = median(of: objectPoints(object))
        }
        result.floor = median(of: floorPoints(room))
        return result
    }

    // MARK: - Sample points (RoomPlan world frame)

    /// A 3×2 grid across the middle of the wall, away from edges and corners.
    private func wallPoints(_ wall: CapturedRoom.Surface) -> [SIMD3<Float>] {
        let center = position(wall.transform)
        let along = axis(wall.transform, 0)
        var points: [SIMD3<Float>] = []
        for a in [-0.3, 0, 0.3] as [Float] {
            for b in [-0.15, 0.15] as [Float] {
                points.append(center + along * (a * wall.dimensions.x) + SIMD3<Float>(0, b * wall.dimensions.y, 0))
            }
        }
        return points
    }

    /// Points on the top face and the middle of each side face.
    private func objectPoints(_ object: CapturedRoom.Object) -> [SIMD3<Float>] {
        let center = position(object.transform)
        let x = axis(object.transform, 0) * (object.dimensions.x / 2)
        let z = axis(object.transform, 2) * (object.dimensions.z / 2)
        let top = center + SIMD3<Float>(0, object.dimensions.y / 2, 0)
        return [
            top, top + x * 0.5, top - x * 0.5, top + z * 0.5, top - z * 0.5,
            center + x, center - x, center + z, center - z,
        ]
    }

    /// A 0.75 m grid over the floor, skipping spots under detected objects.
    private func floorPoints(_ room: CapturedRoom) -> [SIMD3<Float>] {
        let corners = room.walls.flatMap { wall -> [SIMD3<Float>] in
            let along = axis(wall.transform, 0) * (wall.dimensions.x / 2)
            return [position(wall.transform) - along, position(wall.transform) + along]
        }
        guard let floorY = room.walls.map({ position($0.transform).y - $0.dimensions.y / 2 }).min(),
              let minX = corners.map(\.x).min(), let maxX = corners.map(\.x).max(),
              let minZ = corners.map(\.z).min(), let maxZ = corners.map(\.z).max()
        else { return [] }

        var points: [SIMD3<Float>] = []
        for x in stride(from: minX + 0.3, to: maxX - 0.3, by: 0.75) {
            for z in stride(from: minZ + 0.3, to: maxZ - 0.3, by: 0.75) {
                let underObject = room.objects.contains { object in
                    let c = position(object.transform)
                    let reach = max(object.dimensions.x, object.dimensions.z) / 2 + 0.1
                    return simd_distance(SIMD2(c.x, c.z), SIMD2(x, z)) < reach
                }
                if !underObject { points.append(SIMD3<Float>(x, floorY, z)) }
            }
        }
        return points
    }

    private func median(of points: [SIMD3<Float>]) -> EstimatedColor? {
        var samples: [SIMD3<UInt8>] = []
        for frame in frames {
            for point in points {
                if let color = frame.color(at: point) { samples.append(color) }
            }
        }
        return ColorMath.median(samples)
    }

    private func position(_ t: simd_float4x4) -> SIMD3<Float> {
        SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
    }

    private func axis(_ t: simd_float4x4, _ index: Int) -> SIMD3<Float> {
        let c = t[index]
        return SIMD3(c.x, c.y, c.z)
    }
}

extension ColorFrame {
    /// Downscales the camera image (YCbCr 4:2:0, full range) to RGB and copies depth.
    /// Copies everything so the ARFrame itself is released right away.
    init?(frame: ARFrame, width: Int) {
        let buffer = frame.capturedImage
        guard CVPixelBufferGetPlaneCount(buffer) == 2 else { return nil }
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

        let fullWidth = CVPixelBufferGetWidthOfPlane(buffer, 0)
        let fullHeight = CVPixelBufferGetHeightOfPlane(buffer, 0)
        guard fullWidth > 0, fullHeight > 0,
              let lumaBase = CVPixelBufferGetBaseAddressOfPlane(buffer, 0),
              let chromaBase = CVPixelBufferGetBaseAddressOfPlane(buffer, 1)
        else { return nil }
        let luma = lumaBase.assumingMemoryBound(to: UInt8.self)
        let chroma = chromaBase.assumingMemoryBound(to: UInt8.self)
        let lumaStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
        let chromaStride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 1)

        let height = fullHeight * width / fullWidth
        var rgb = [SIMD3<UInt8>](repeating: .zero, count: width * height)
        for ty in 0..<height {
            let sy = ty * fullHeight / height
            for tx in 0..<width {
                let sx = tx * fullWidth / width
                let yValue = Float(luma[sy * lumaStride + sx])
                let chromaIndex = (sy / 2) * chromaStride + (sx / 2) * 2
                let cb = Float(chroma[chromaIndex]) - 128
                let cr = Float(chroma[chromaIndex + 1]) - 128
                rgb[ty * width + tx] = ColorMath.clampRGB(
                    yValue + 1.402 * cr,
                    yValue - 0.344136 * cb - 0.714136 * cr,
                    yValue + 1.772 * cb
                )
            }
        }

        let scale = Float(width) / Float(fullWidth)
        var intrinsics = frame.camera.intrinsics
        intrinsics[0][0] *= scale
        intrinsics[1][1] *= scale
        intrinsics[2][0] *= scale
        intrinsics[2][1] *= scale

        var depthValues: [Float]?
        var depthWidth = 0, depthHeight = 0
        if let depthMap = (frame.sceneDepth ?? frame.smoothedSceneDepth)?.depthMap {
            CVPixelBufferLockBaseAddress(depthMap, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }
            if let base = CVPixelBufferGetBaseAddress(depthMap) {
                depthWidth = CVPixelBufferGetWidth(depthMap)
                depthHeight = CVPixelBufferGetHeight(depthMap)
                let stride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float>.size
                let values = base.assumingMemoryBound(to: Float.self)
                var copy = [Float](repeating: 0, count: depthWidth * depthHeight)
                for row in 0..<depthHeight {
                    for column in 0..<depthWidth {
                        copy[row * depthWidth + column] = values[row * stride + column]
                    }
                }
                depthValues = copy
            }
        }

        self.init(width: width, height: height, rgb: rgb,
                  worldToCamera: frame.camera.transform.inverse, intrinsics: intrinsics,
                  depth: depthValues, depthWidth: depthWidth, depthHeight: depthHeight)
    }
}

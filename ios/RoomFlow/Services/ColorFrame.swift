import Foundation
import simd

/// One downscaled camera frame. Pixels are in the camera sensor's native (landscape) orientation,
/// top-left origin, which is the orientation ARKit's intrinsics describe.
nonisolated struct ColorFrame {
    let width: Int
    let height: Int
    let rgb: [SIMD3<UInt8>]
    let worldToCamera: simd_float4x4
    /// Camera intrinsics scaled to `width` × `height`.
    let intrinsics: simd_float3x3
    /// Per-pixel depth in meters (LiDAR), if the frame had it.
    let depth: [Float]?
    let depthWidth: Int
    let depthHeight: Int

    init(width: Int, height: Int, rgb: [SIMD3<UInt8>], worldToCamera: simd_float4x4, intrinsics: simd_float3x3,
         depth: [Float]? = nil, depthWidth: Int = 0, depthHeight: Int = 0) {
        self.width = width
        self.height = height
        self.rgb = rgb
        self.worldToCamera = worldToCamera
        self.intrinsics = intrinsics
        self.depth = depth
        self.depthWidth = depthWidth
        self.depthHeight = depthHeight
    }

    /// Color at a world point, or nil when it's off-screen, behind the camera, too far to be
    /// reliable, or hidden behind something closer.
    func color(at world: SIMD3<Float>, depthTolerance: Float = 0.2) -> SIMD3<UInt8>? {
        // ARKit camera space: x right, y up, looking down -z.
        let p = worldToCamera * SIMD4<Float>(world, 1)
        let distance = -p.z
        guard distance > 0.3, distance < 5 else { return nil }

        let u = intrinsics[0][0] * p.x / distance + intrinsics[2][0]
        let v = intrinsics[2][1] - intrinsics[1][1] * p.y / distance
        guard u >= 0, v >= 0 else { return nil }
        let x = Int(u), y = Int(v)
        guard x < width, y < height else { return nil }

        if let depth, depthWidth > 0, depthHeight > 0 {
            let dx = min(depthWidth - 1, x * depthWidth / width)
            let dy = min(depthHeight - 1, y * depthHeight / height)
            let measured = depth[dy * depthWidth + dx]
            guard measured.isFinite, abs(measured - distance) < depthTolerance else { return nil }
        }
        return rgb[y * width + x]
    }
}

nonisolated enum ColorMath {
    static func clampRGB(_ r: Float, _ g: Float, _ b: Float) -> SIMD3<UInt8> {
        SIMD3(UInt8(max(0, min(255, r.rounded()))), UInt8(max(0, min(255, g.rounded()))), UInt8(max(0, min(255, b.rounded()))))
    }

    /// Per-channel median; nil with fewer than 3 samples (too little evidence).
    static func median(_ samples: [SIMD3<UInt8>]) -> EstimatedColor? {
        guard samples.count >= 3 else { return nil }
        func channel(_ values: [UInt8]) -> UInt8 { values.sorted()[values.count / 2] }
        let r = channel(samples.map(\.x)), g = channel(samples.map(\.y)), b = channel(samples.map(\.z))
        return EstimatedColor(hex: String(format: "#%02X%02X%02X", r, g, b), sampleCount: samples.count)
    }
}

// Writes public/dev/test-box.glb: a tiny, dependency-free glTF 2.0 binary
// (one 1 x 1 x 1 m box, flat normals, one material) used only to exercise the
// GLB loading path in the dev asset lineup.
// Usage: node scripts/generate-test-glb.mjs public/dev/test-box.glb
import { writeFileSync } from 'node:fs'

const faces = [
  // normal, then four corners (counter-clockwise seen from outside)
  [[1, 0, 0], [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]],
  [[-1, 0, 0], [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]]],
  [[0, 1, 0], [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]],
  [[0, -1, 0], [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]],
  [[0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
  [[0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]],
]

const positions = []
const normals = []
const indices = []
faces.forEach(([normal, corners], face) => {
  for (const corner of corners) {
    positions.push(...corner)
    normals.push(...normal)
  }
  const base = face * 4
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
})

const positionBytes = new Float32Array(positions).buffer
const normalBytes = new Float32Array(normals).buffer
const indexBytes = new Uint16Array(indices).buffer
const bin = Buffer.concat([Buffer.from(positionBytes), Buffer.from(normalBytes), Buffer.from(indexBytes)])
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)])

const gltf = {
  asset: { version: '2.0', generator: 'roomflow generate-test-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'test-box' }],
  materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.55, 0.62, 0.7, 1], metallicFactor: 0, roughnessFactor: 0.7 } }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  buffers: [{ byteLength: binPadded.length }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: 34962 },
    { buffer: 0, byteOffset: positionBytes.byteLength, byteLength: normalBytes.byteLength, target: 34962 },
    { buffer: 0, byteOffset: positionBytes.byteLength + normalBytes.byteLength, byteLength: indexBytes.byteLength, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    { bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: indices.length, type: 'SCALAR' },
  ],
}

const json = Buffer.from(JSON.stringify(gltf))
const jsonPadded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])

const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0) // 'glTF'
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8)

const jsonHeader = Buffer.alloc(8)
jsonHeader.writeUInt32LE(jsonPadded.length, 0)
jsonHeader.writeUInt32LE(0x4e4f534a, 4) // 'JSON'

const binHeader = Buffer.alloc(8)
binHeader.writeUInt32LE(binPadded.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4) // 'BIN\0'

writeFileSync(process.argv[2], Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded]))

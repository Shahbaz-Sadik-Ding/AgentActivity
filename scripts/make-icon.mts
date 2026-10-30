// Generates resources/icon.png (256) and resources/icon.ico (PNG-in-ICO) with no dependencies.
//   node make-icon.mts   (run via tsx)
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const N = 256
const SS = 3 // supersampling per axis
const px = Buffer.alloc(N * N * 4)

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
const BG1 = [38, 36, 34]
const BG2 = [66, 46, 38]
const ACC = [217, 119, 87]
const VIO = [232, 162, 124]
const GRN = [143, 181, 115]

/** Returns [r,g,b,a] (0-255, a 0-1) for a point in 0..N space. */
function sample(x: number, y: number): [number, number, number, number] {
  // rounded-square mask
  const r = 56
  const cx = Math.min(Math.max(x, r), N - r)
  const cy = Math.min(Math.max(y, r), N - r)
  if (Math.hypot(x - cx, y - cy) > r) return [0, 0, 0, 0]

  let c = mix(BG1, BG2, (x + y) / (2 * N))
  const dx = x - N / 2
  const dy = y - N / 2
  const d = Math.hypot(dx, dy)

  // soft glow behind the orb
  const glow = Math.max(0, 1 - d / 120) ** 2 * 0.45
  c = mix(c, ACC, glow)

  // outer ring
  if (Math.abs(d - 78) < 5) c = mix(c, ACC, 0.9)
  // inner ring
  if (Math.abs(d - 48) < 3) c = mix(c, VIO, 0.55)
  // core orb
  if (d < 30) c = mix(mix(ACC, VIO, (dx + dy) / 120 + 0.5), [255, 255, 255], Math.max(0, 0.5 - d / 60))
  // satellite on the outer ring (upper right) + a "live" dot on the inner one
  if (Math.hypot(x - (N / 2 + 78 * Math.cos(-0.8)), y - (N / 2 + 78 * Math.sin(-0.8))) < 15) c = [255, 255, 255]
  if (Math.hypot(x - (N / 2 + 48 * Math.cos(2.4)), y - (N / 2 + 48 * Math.sin(2.4))) < 9) c = GRN
  return [c[0], c[1], c[2], 1]
}

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let R = 0, G = 0, B = 0, A = 0
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const [r, g, b, a] = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)
        R += r * a; G += g * a; B += b * a; A += a
      }
    const o = (y * N + x) * 4
    if (A > 0) {
      px[o] = R / A; px[o + 1] = G / A; px[o + 2] = B / A
    }
    px[o + 3] = Math.round((A / (SS * SS)) * 255)
  }
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (b: Buffer) => {
  let c = 0xffffffff
  for (const v of b) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(N, 0)
ihdr.writeUInt32BE(N, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc((N * 4 + 1) * N)
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4)
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const ico = Buffer.alloc(22)
ico.writeUInt16LE(1, 2) // type: icon
ico.writeUInt16LE(1, 4) // one image
ico[6] = 0 // width 256 (0 = 256)
ico[7] = 0
ico.writeUInt16LE(1, 10) // planes
ico.writeUInt16LE(32, 12) // bpp
ico.writeUInt32LE(png.length, 14)
ico.writeUInt32LE(22, 18)

const dir = path.resolve('resources')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'icon.png'), png)
fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([ico, png]))
console.log('wrote', dir, png.length, 'bytes')

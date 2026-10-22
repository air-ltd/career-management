/**
 * The application icons, rasterised from the artwork in `public/favicon.svg`.
 *
 * A web app manifest wants raster icons — 192 and 512 pixels for the install
 * prompt, 180 for the iOS home screen — and the repository has one SVG. There is
 * no image library in this project and no rasteriser on the build machine, so
 * the shapes are drawn here and written out as PNGs: a rounded rectangle, a page
 * and four lines, which is what the artwork is.
 *
 * The PNGs are committed, so a build does not need this script and CI does not
 * need a rasteriser. It is here so the icons can be changed deliberately: edit
 * the artwork, run `npm run icons`, and commit the result.
 *
 * The drawing is the artwork's shapes rather than a general SVG renderer,
 * because a general renderer is a dependency and this is nine shapes.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PUBLIC = resolve(import.meta.dirname, '..', 'public')

/** The artwork, in the 64×64 units of `favicon.svg`. */
const BLUE = [0x25, 0x63, 0xeb]
const PALE = [0x93, 0xb4, 0xf8]
const WHITE = [0xff, 0xff, 0xff]

/** Whether a point is inside a rounded rectangle. */
function insideRoundedRect(x, y, x0, y0, width, height, radius) {
  if (x < x0 || y < y0 || x > x0 + width || y > y0 + height) return false
  const cx = Math.min(Math.max(x, x0 + radius), x0 + width - radius)
  const cy = Math.min(Math.max(y, y0 + radius), y0 + height - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

/**
 * The colour of the artwork at a point, in the artwork's own units.
 *
 * The page is drawn first and the lines on top of it; the blue square behind
 * everything is the background.
 */
function artworkColour(x, y) {
  if (!insideRoundedRect(x, y, 16, 13, 32, 38, 3)) return BLUE
  if (insideRoundedRect(x, y, 21, 21, 22, 3, 1.5)) return BLUE
  if (insideRoundedRect(x, y, 21, 28, 22, 2.5, 1.25)) return PALE
  if (insideRoundedRect(x, y, 21, 34, 16, 2.5, 1.25)) return PALE
  if (insideRoundedRect(x, y, 21, 40, 19, 2.5, 1.25)) return PALE
  return WHITE
}

/**
 * Draw the icon at a size.
 *
 * `maskable` is the Android adaptive icon: the square is filled edge to edge
 * because the platform masks it, and the artwork is scaled to 72% and centred so
 * that it stays inside the circle the platform may cut it to.
 */
function draw(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4)
  const samples = 4
  const art = maskable ? 0.72 : 1

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let covered = 0

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = ((px + (sx + 0.5) / samples) * 64) / size
          const y = ((py + (sy + 0.5) / samples) * 64) / size

          // The background is the rounded square, or the whole square when the
          // platform is going to mask it.
          if (!maskable && !insideRoundedRect(x, y, 0, 0, 64, 64, 12)) continue

          const ax = (x - 32) / art + 32
          const ay = (y - 32) / art + 32
          const colour = artworkColour(ax, ay)
          r += colour[0]
          g += colour[1]
          b += colour[2]
          covered += 1
        }
      }

      const offset = (py * size + px) * 4
      if (covered === 0) continue
      // The colour of the covered samples, and how much of the pixel they cover.
      pixels[offset] = Math.round(r / covered)
      pixels[offset + 1] = Math.round(g / covered)
      pixels[offset + 2] = Math.round(b / covered)
      pixels[offset + 3] = Math.round((covered / (samples * samples)) * 255)
    }
  }

  return pixels
}

/** The CRC-32 of a buffer, which every PNG chunk carries. */
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** One PNG chunk: its length, its type, its data and its checksum. */
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, checksum])
}

/** Encode RGBA pixels as a PNG. */
function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // truecolour with alpha
  header[10] = 0 // deflate
  header[11] = 0 // adaptive filtering
  header[12] = 0 // no interlace

  // One filter byte per scanline, and no filtering: the icons are flat
  // rectangles of colour, which compress as well unfiltered as filtered.
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const icons = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
]

for (const icon of icons) {
  const png = encodePng(icon.size, icon.size, draw(icon.size, { maskable: icon.maskable }))
  writeFileSync(resolve(PUBLIC, icon.file), png)
  console.log(`${icon.file}: ${icon.size}×${icon.size}, ${png.length} bytes`)
}

/**
 * Generates the app icons as real PNGs, with no image library.
 *
 *   node scripts/make-icons.mjs
 *
 * The mark is a speech bubble — drawn analytically per pixel (rounded rectangle plus a
 * tail), supersampled 4x for smooth edges. PNG is assembled by hand: signature, IHDR,
 * a deflated IDAT of filter-0 scanlines, IEND. Node's zlib does the only hard part.
 *
 * Re-run this if you change the colours. To use your own artwork instead, just drop
 * icon-192.png, icon-512.png and apple-touch-icon.png into public/ and delete this script.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// Blue field with a white mark: reads on a light or a dark launcher alike.
const FIELD = [0x2a, 0x78, 0xd6];
const MARK = [0xff, 0xff, 0xff];

/* ---- PNG plumbing --------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline is prefixed with filter type 0 (none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---- The mark ------------------------------------------------------------- */

/** Signed-distance-ish test for a rounded rectangle. */
function inRoundedRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  if (x >= left && x <= right && y >= top + radius && y <= bottom - radius) return true;
  if (y >= top && y <= bottom && x >= left + radius && x <= right - radius) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function inTail(x, y, size) {
  // A small triangle hanging off the bottom-left of the bubble.
  const apexX = size * 0.3;
  const apexY = size * 0.82;
  const baseY = size * 0.66;
  if (y < baseY || y > apexY) return false;
  const t = (y - baseY) / (apexY - baseY);
  const leftEdge = apexX;
  const rightEdge = size * 0.46 - (size * 0.16) * t;
  return x >= leftEdge && x <= rightEdge;
}

/** `maskable` icons must keep the mark inside the safe zone, so inset the artwork. */
function render(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4; // supersampling factor per axis

  const inset = maskable ? size * 0.14 : size * 0.06;
  const left = inset;
  const right = size - inset;
  const top = inset;
  const bubbleBottom = size * 0.68;
  const radius = size * 0.13;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (
            inRoundedRect(px, py, left, top, right, bubbleBottom, radius) ||
            (!maskable && inTail(px, py, size))
          ) {
            hits++;
          }
        }
      }

      const coverage = hits / (SS * SS);
      const i = (y * size + x) * 4;
      // White mark over an opaque blue field, so it reads on any launcher.
      rgba[i] = Math.round(FIELD[0] + (MARK[0] - FIELD[0]) * coverage);
      rgba[i + 1] = Math.round(FIELD[1] + (MARK[1] - FIELD[1]) * coverage);
      rgba[i + 2] = Math.round(FIELD[2] + (MARK[2] - FIELD[2]) * coverage);
      rgba[i + 3] = 255;
    }
  }

  return encodePng(size, size, rgba);
}

const PUBLIC = path.join(process.cwd(), "public");
mkdirSync(PUBLIC, { recursive: true });

const targets = [
  ["icon-192.png", 192, { maskable: false }],
  ["icon-512.png", 512, { maskable: false }],
  ["icon-maskable-512.png", 512, { maskable: true }],
  // iOS ignores the manifest for the home-screen icon and uses this one.
  ["apple-touch-icon.png", 180, { maskable: false }],
];

for (const [name, size, opts] of targets) {
  const png = render(size, opts);
  writeFileSync(path.join(PUBLIC, name), png);
  console.log(`public/${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}

// Generates PWA icons (dark panel + burnt-orange play glyph) as PNGs with zero deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BG = [0x13, 0x13, 0x11];
const EDGE = [0x2e, 0x2e, 0x2b];
const ORANGE_TOP = [0xd4, 0x62, 0x2b];
const ORANGE_BOT = [0xa8, 0x46, 0x1c];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixelFn) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelFn(x, y, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function pixel(x, y, size, pad) {
  const u = x / size, v = y / size;
  // play triangle, slightly right-shifted optical center
  const cx = 0.56, cy = 0.5, h = 0.46 - pad;
  const x0 = cx - h * 0.72, x1 = cx + h * 0.78;
  const inTri = x >= x0 * size && x <= x1 * size &&
    Math.abs(v - cy) <= ((x1 - u) / (x1 - x0)) * h * 0.92;
  if (inTri) {
    const t = (u + v) / 2;
    return [lerp(ORANGE_TOP[0], ORANGE_BOT[0], t), lerp(ORANGE_TOP[1], ORANGE_BOT[1], t), lerp(ORANGE_TOP[2], ORANGE_BOT[2], t)];
  }
  const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
  if (edge < size * 0.015) return EDGE;
  // faint scanline texture
  if (y % 6 === 5) return [BG[0] - 4, BG[1] - 4, BG[2] - 4];
  return BG;
}

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'icon-192.png'), png(192, (x, y, s) => pixel(x, y, s, 0)));
writeFileSync(join(root, 'public', 'icon-512.png'), png(512, (x, y, s) => pixel(x, y, s, 0)));
// maskable: same art with extra safe-zone padding
writeFileSync(join(root, 'public', 'icon-maskable-512.png'), png(512, (x, y, s) => pixel(x, y, s, 0.12)));
console.log('icons written to public/');

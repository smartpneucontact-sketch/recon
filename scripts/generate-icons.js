// One-off PNG icon generator (pure Node, no deps).
// Run once: `node scripts/generate-icons.js`
// Outputs to public/: icon-192.png, icon-512.png, icon-maskable.png, apple-touch-icon.png
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const NAVY = [0x0a, 0x22, 0x40];
const GOLD = [0xff, 0xd2, 0x4d];
const WHITE = [0xff, 0xff, 0xff];

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// 5-point star scaled to unit circle (radius 1)
function inStar(px, py, cx, cy, r) {
  const dx = px - cx, dy = py - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > r) return false;
  // Rotate so one point goes up
  let ang = Math.atan2(dy, dx) + Math.PI / 2;
  ang = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const slice = (Math.PI * 2) / 5;
  const phase = ang % slice;
  const halfSlice = slice / 2;
  const localAng = Math.abs(phase - halfSlice);
  // Star edge as function of angle (simple approximation)
  const outer = 1;
  const inner = 0.42;
  const edge = inner + (outer - inner) * (1 - localAng / halfSlice);
  return dist <= r * edge;
}

function drawPixel(x, y, size, maskable) {
  // Maskable: full-bleed navy, smaller inner star
  // Non-maskable: rounded square navy with gold star
  const cx = size / 2, cy = size / 2;
  const radius = size * 0.5;
  const corner = size * 0.18;
  // Rounded square mask (only for non-maskable)
  if (!maskable) {
    const inX = x >= corner && x <= size - corner;
    const inY = y >= corner && y <= size - corner;
    if (!inX && !inY) {
      const dx = Math.min(x, size - x) - corner;
      const dy = Math.min(y, size - y) - corner;
      if (dx * dx + dy * dy > corner * corner) return [0, 0, 0, 0];
    }
  }
  // Star
  const starR = size * (maskable ? 0.28 : 0.36);
  if (inStar(x, y, cx, cy, starR)) return [...GOLD, 255];
  return [...NAVY, 255];
}

function makePNG(size, maskable) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y, size, maskable);
      const o = y * stride + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(outDir, 'icon-192.png'), makePNG(192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makePNG(512, false));
fs.writeFileSync(path.join(outDir, 'icon-maskable.png'), makePNG(512, true));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), makePNG(180, true));
console.log('Generated PWA icons in public/.');

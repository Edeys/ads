// Sinh icon cho app desktop (PNG + ICO) không cần thư viện ngoài.
// Chạy: node desktop/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

const TOP = [26, 122, 255]; // #1a7aff
const BOTTOM = [7, 62, 176]; // #073eb0
const GLYPH = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function render(size) {
  const SS = 3; // supersample
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.235; // bo góc
  const stroke = size * 0.062;
  const segs = [
    [0.315, 0.725, 0.5, 0.268],
    [0.5, 0.268, 0.685, 0.725],
    [0.393, 0.56, 0.607, 0.56],
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inShape = 0;
      let inGlyph = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          // rounded rect
          const cx = Math.min(Math.max(fx, r), size - r);
          const cy = Math.min(Math.max(fy, r), size - r);
          if (Math.hypot(fx - cx, fy - cy) <= r) inShape++;
          for (const [x1, y1, x2, y2] of segs) {
            if (distSeg(fx, fy, x1 * size, y1 * size, x2 * size, y2 * size) <= stroke / 2) {
              inGlyph++;
              break;
            }
          }
        }
      }
      const n = SS * SS;
      const aShape = inShape / n;
      const aGlyph = Math.min(inGlyph / n, aShape);
      const i = (y * size + x) * 4;
      if (aShape <= 0) {
        px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0;
        continue;
      }
      const t = y / (size - 1);
      const base = [0, 1, 2].map((k) => Math.round(TOP[k] + (BOTTOM[k] - TOP[k]) * t));
      const col = [0, 1, 2].map((k) => Math.round(base[k] + (GLYPH[k] - base[k]) * aGlyph));
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
      px[i + 3] = Math.round(255 * aShape);
    }
  }
  return px;
}

// DIB 32bpp cho ICO (BGRA bottom-up + AND mask).
// RC.exe (Windows SDK) khong doc duoc ICO nen PNG, phai la BMP thuoc.
function dib(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight = XOR + AND
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression = BI_RGB
  header.writeUInt32LE(0, 20); // biSizeImage
  header.writeInt32LE(0, 24); // biXPelsPerMeter
  header.writeInt32LE(0, 28); // biYPelsPerMeter
  header.writeUInt32LE(0, 32); // biClrUsed
  header.writeUInt32LE(0, 36); // biClrImportant

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size * 4; // BMP bottom-up
    for (let x = 0; x < size; x++) {
      const s = srcRow + x * 4;
      const d = (y * size + x) * 4;
      xor[d] = rgba[s + 2]; // B
      xor[d + 1] = rgba[s + 1]; // G
      xor[d + 2] = rgba[s]; // R
      xor[d + 3] = rgba[s + 3]; // A
    }
  }

  const maskStride = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(maskStride * size, 0);
  return Buffer.concat([header, xor, and]);
}

// ICO nhieu kich thuoc, moi entry la DIB 32bpp. Header/directory deu little-endian.
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach(({ size, data }, i) => {
    const e = 16 * i;
    directory[e] = size >= 256 ? 0 : size;
    directory[e + 1] = size >= 256 ? 0 : size;
    directory[e + 2] = 0; // colors
    directory[e + 3] = 0; // reserved
    directory.writeUInt16LE(1, e + 4); // planes
    directory.writeUInt16LE(32, e + 6); // bpp
    directory.writeUInt32LE(data.length, e + 8); // size (LE)
    directory.writeUInt32LE(offset, e + 12); // offset
    offset += data.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.data)]);
}

const targets = [
  ["icon.png", 512],
  ["128x128@2x.png", 256],
  ["128x128.png", 128],
  ["32x32.png", 32],
];
for (const [name, size] of targets) {
  writeFileSync(join(outDir, name), png(size, render(size)));
  console.log(`[icons] ${name} (${size}×${size})`);
}

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = icoSizes.map((size) => ({ size, data: dib(size, render(size)) }));
writeFileSync(join(outDir, "icon.ico"), ico(icoImages));
console.log(`[icons] icon.ico (${icoSizes.join("/")})`);

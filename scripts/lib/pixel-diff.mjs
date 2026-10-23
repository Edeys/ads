/**
 * Lõi so sánh pixel giữa 2 ảnh PNG — dùng chung cho ui-diff.mjs và ui-parity.mjs.
 *
 * Cách đo: đưa 2 ảnh về cùng khung (rộng = ảnh A, cao = ảnh thấp hơn, kéo giãn fill),
 * so từng pixel; coi là "lệch" khi một kênh màu lệch > 12/255 hoặc alpha lệch > 16.
 *
 * `region` cho phép chỉ so một vùng (vd. cột sidebar) để tách "khung" khỏi "nội dung".
 */
import sharp from "sharp";

const TOLERANCE = 12;
const ALPHA_TOLERANCE = 16;

function clampRegion(meta, region) {
  const srcW = meta.width ?? 1;
  const srcH = meta.height ?? 1;
  const left = Math.max(0, Math.min(region?.left ?? 0, srcW - 1));
  const top = Math.max(0, Math.min(region?.top ?? 0, srcH - 1));
  const width = Math.max(1, Math.min(region?.width ?? srcW, srcW - left));
  const height = Math.max(1, Math.min(region?.height ?? srcH, srcH - top));
  return { left, top, width, height };
}

async function open(file, region) {
  // metadata() luôn trả kích thước ẢNH GỐC, nên phải tự tính vùng cắt trước khi resize.
  const meta = await sharp(file).metadata();
  const box = clampRegion(meta, region);
  const base = sharp(file).ensureAlpha();
  const img = region ? base.extract(box) : base;
  return { img, size: { width: box.width, height: box.height } };
}

export async function pixelDiff(fileA, fileB, diffOut, options = {}) {
  const region = options.region ?? null;
  const [a, b] = await Promise.all([open(fileA, region), open(fileB, region)]);

  const width = Math.min(a.size.width, b.size.width);
  const height = Math.min(a.size.height, b.size.height);

  const rawA = await a.img.resize({ width, height, fit: "fill" }).raw().toBuffer();
  const rawB = await b.img.resize({ width, height, fit: "fill" }).raw().toBuffer();

  const diff = Buffer.alloc(width * height * 4);
  let diffPixels = 0;
  let sumDelta = 0;

  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    const da = Math.abs(rawA[o] - rawB[o]);
    const db = Math.abs(rawA[o + 1] - rawB[o + 1]);
    const dc = Math.abs(rawA[o + 2] - rawB[o + 2]);
    const dAlpha = Math.abs(rawA[o + 3] - rawB[o + 3]);
    sumDelta += (da + db + dc) / 3;

    const off = da > TOLERANCE || db > TOLERANCE || dc > TOLERANCE || dAlpha > ALPHA_TOLERANCE;
    if (off) {
      diffPixels += 1;
      diff[o] = 255;
      diff[o + 1] = 40;
      diff[o + 2] = 40;
      diff[o + 3] = 220;
    } else {
      const gray = Math.round(0.3 * rawA[o] + 0.59 * rawA[o + 1] + 0.11 * rawA[o + 2]);
      diff[o] = gray;
      diff[o + 1] = gray;
      diff[o + 2] = gray;
      diff[o + 3] = 60;
    }
  }

  if (diffOut) {
    await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffOut);
  }

  const total = width * height;
  return {
    width,
    height,
    sizeA: [a.size.width, a.size.height],
    sizeB: [b.size.width, b.size.height],
    diffPixels,
    diffPercent: Number(((diffPixels / total) * 100).toFixed(2)),
    meanDelta: Number((sumDelta / total).toFixed(2)),
    diffImage: diffOut ?? null,
  };
}

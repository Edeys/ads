// Codemod: sua file bi mojibake do UTF-8 bi doc nhu CP1252 (vi du "Chá» cháº¥p nháº­n").
//
// Nguyen tac: chi sua file ma TOAN BO ky tu ngoai ASCII deu nam trong bang CP1252
// (khong co ky tu that nhu tieng Viet dung san), de tranh lam hong file da dung.
// Chay lai nhieu lan duoc: file da sach se khong con dau hieu mojibake.
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:\\ADS MCP APP\\src";

// CP1252 -> byte (chi cac vi tri 0x80..0x9F khac latin1).
const CP1252_TO_BYTE = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

const MARKERS = /Ã|á»|â€|Ä‘|áº|Æ°|Ã¢|Ã´|Ã /;

function encodeCp1252(text) {
  const bytes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfeff) continue; // BOM
    if (cp < 0x100) {
      bytes.push(cp);
    } else if (CP1252_TO_BYTE.has(cp)) {
      bytes.push(CP1252_TO_BYTE.get(cp));
    } else {
      return null; // ky tu that su khong thuoc CP1252 -> khong phai mojibake thuan
    }
  }
  return Buffer.from(bytes);
}

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts|css|md)$/.test(e.name)) files.push(p);
  }
})(ROOT);

let fixed = 0;
for (const f of files) {
  const before = fs.readFileSync(f, "utf8");
  if (!MARKERS.test(before)) continue;
  if (!/[\u0080-\u009f\u00a0-\u00ff]/.test(before)) continue;

  const bytes = encodeCp1252(before);
  if (!bytes) continue;

  let after;
  try {
    after = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    continue; // khong phai chuoi UTF-8 hop le sau khi dich nguoc -> bo qua
  }

  // Chi chap nhan neu ket qua that su giam dau hieu mojibake.
  const badBefore = (before.match(/Ã|á»|â€|Ä‘|áº|Æ°/g) ?? []).length;
  const badAfter = (after.match(/Ã|á»|â€|Ä‘|áº|Æ°/g) ?? []).length;
  if (badAfter >= badBefore) continue;

  fs.writeFileSync(f, after, "utf8");
  console.log(`fixed ${f} (${badBefore} -> ${badAfter} markers)`);
  fixed++;
}
console.log(`da sua ${fixed} file`);

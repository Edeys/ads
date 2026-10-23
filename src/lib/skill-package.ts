// Đọc gói skill .zip / .skill (zip container) hoặc .md thuần, trích SKILL.md.
// Không thêm dependency: parse central directory của zip bằng zlib.inflateRawSync.
import { inflateRawSync } from "node:zlib";

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number };

/** SKILL.md chỉ là text hướng dẫn — 2MB là quá đủ, tránh zip bomb. */
const MAX_SKILL_BYTES = 2 * 1024 * 1024;

function readCentralDirectory(buf: Buffer): ZipEntry[] {
  // EOCD: signature 0x06054b50 (quét từ cuối, comment tối đa 65535 byte)
  let eocd = -1;
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("File không phải gói zip hợp lệ");
  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const uncompressedSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    if (ptr + 46 + nameLen + extraLen + commentLen > buf.length) break;
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry): string {
  if (entry.uncompressedSize > MAX_SKILL_BYTES) {
    throw new Error(`SKILL.md quá lớn (tối đa ${MAX_SKILL_BYTES / 1024 / 1024}MB sau giải nén)`);
  }
  if (entry.localOffset + 30 > buf.length) throw new Error("Gói zip bị hỏng (local header ngoài phạm vi)");
  const nameLen = buf.readUInt16LE(entry.localOffset + 26);
  const extraLen = buf.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  if (start + entry.compressedSize > buf.length) throw new Error("Gói zip bị hỏng (dữ liệu ngoài phạm vi)");
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) {
    if (raw.length > MAX_SKILL_BYTES) throw new Error("SKILL.md quá lớn");
    return raw.toString("utf8");
  }
  if (entry.method === 8) {
    return inflateRawSync(raw, { maxOutputLength: MAX_SKILL_BYTES }).toString("utf8");
  }
  throw new Error(`Phương thức nén không hỗ trợ: ${entry.method}`);
}

export type ParsedSkill = {
  name: string;
  description: string;
  platforms: string[];
  fileName: string;
  content: string;
};

// Frontmatter YAML tối giản: name / description / platforms (dạng list hoặc chuỗi).
function parseFrontmatter(text: string) {
  const meta: Record<string, string> = {};
  if (!text.startsWith("---")) return meta;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return meta;
  const block = text.slice(3, end);
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim());
    if (m) meta[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return meta;
}

function titleFromMarkdown(text: string) {
  const h1 = /^#\s+(.+)$/m.exec(text);
  return h1 ? h1[1].trim() : "";
}

export function parseSkillPackage(buf: Buffer, fileName: string): ParsedSkill {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".md") || lower.endsWith(".txt")) {
    if (buf.length > MAX_SKILL_BYTES) throw new Error("File skill quá lớn (tối đa 2MB)");
    const content = buf.toString("utf8");
    const fm = parseFrontmatter(content);
    return {
      name: (fm.name || titleFromMarkdown(content) || fileName.replace(/\.(md|txt)$/i, "")).slice(0, 120),
      description: fm.description || "",
      platforms: fm.platforms ? fm.platforms.split(/[,\s]+/).filter(Boolean) : [],
      fileName,
      content,
    };
  }

  if (!lower.endsWith(".zip") && !lower.endsWith(".skill")) {
    throw new Error("Chỉ chấp nhận file .zip hoặc .skill");
  }
  const entries = readCentralDirectory(buf);
  const skillMd = entries
    .filter((e) => !e.name.endsWith("/") && /(^|\/)SKILL\.md$/i.test(e.name))
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0];
  if (!skillMd) throw new Error("Gói thiếu SKILL.md");
  const content = readEntry(buf, skillMd);
  const fm = parseFrontmatter(content);
  if (!fm.name && !titleFromMarkdown(content)) throw new Error("SKILL.md thiếu khối thông tin đầu file (name)");
  const dirName = skillMd.name.includes("/") ? skillMd.name.split("/")[0] : "";
  return {
    name: (fm.name || titleFromMarkdown(content) || dirName || fileName).slice(0, 120),
    description: fm.description || "",
    platforms: fm.platforms ? fm.platforms.split(/[,\s]+/).filter(Boolean) : [],
    fileName,
    content,
  };
}

// Nền tảng đề xuất — dùng cho UI lọc skill.
export const SKILL_PLATFORMS = ["facebook", "tiktok", "google", "pancake", "sheets", "chung"];
export const SKILL_PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  tiktok: "TikTok",
  google: "Google Ads",
  pancake: "Pancake",
  sheets: "Google Sheets",
  chung: "Dùng chung",
};

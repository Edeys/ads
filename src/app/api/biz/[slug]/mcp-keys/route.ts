import { db, schema } from "@/db";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { sha256 } from "@/lib/crypto";
import { PRESET_PROVIDERS } from "@/lib/field-catalog";
import { loadPresetConfig, snapshotConfig } from "@/lib/field-presets";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const keys = await db.select().from(schema.mcpKeys)
    .where(eq(schema.mcpKeys.bizId, m.biz.id)).orderBy(desc(schema.mcpKeys.createdAt));
  const counts = await db.select({ keyId: schema.mcpCallLogs.keyId, n: sql<number>`count(*)::int` })
    .from(schema.mcpCallLogs).groupBy(schema.mcpCallLogs.keyId);
  const cn = new Map(counts.map((c) => [c.keyId, c.n]));
  return Response.json(keys.map((k) => ({
    id: k.id, name: k.name, keyPrefix: k.keyPrefix, status: k.status,
    scopes: k.scopes, expiresAt: k.expiresAt, lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt, callCount: cn.get(k.id) ?? 0,
    fieldPresets: k.fieldPresets, fieldConfig: k.fieldConfig, skillIds: k.skillIds,
  })));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  // Tạo/sửa/revoke key là quyền riêng — chặn ở API, không chỉ ẩn UI.
  if (m.member.role !== "owner" && !(m.member.permissions as string[]).includes("mcp_keys.access")) {
    return Response.json({ error: "thiếu quyền mcp_keys.access" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.name) return Response.json({ error: "Thiếu tên" }, { status: 400 });

  const raw = `mk_${randomBytes(24).toString("hex")}`;
  // Mỗi nền tảng có scope riêng ("read" | "all" | "none"); key chỉ thấy tool của
  // nền tảng được cấp quyền. Mặc định: meta + google + tiktok đều đọc được.
  const scopes = {
    meta_ads: body.metaScope ?? "read",
    google_ads: body.googleScope ?? "read",
    tiktok_ads: body.tiktokScope ?? "read",
    search_console: body.searchConsoleScope ?? "read",
    ga4: body.ga4Scope ?? "read",
    clarity: body.clarityScope ?? "read",
    pancake: body.pancakeScope ?? "none",
    write: body.write ? "true" : "false",
    ...(Array.isArray(body.allowedTools) && body.allowedTools.length ? { allowedTools: body.allowedTools } : {}),
  };
  const { presets, config } = await snapshotPresets(m.biz.id, body.fieldPresets);
  const [k] = await db.insert(schema.mcpKeys).values({
    bizId: m.biz.id, name: body.name,
    keyHash: sha256(raw), keyPrefix: raw.slice(0, 10),
    scopes, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    fieldPresets: presets,
    fieldConfig: config,
    skillIds: await sanitizeSkillIds(m.biz.id, body.skillIds),
  }).returning();
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "mcp_key.create", objectType: "mcp_key", objectId: k.id, detail: { name: body.name } });
  // plaintext chỉ trả 1 lần
  return Response.json({ id: k.id, key: raw, keyPrefix: k.keyPrefix });
}

// Bộ chỉ số: chỉ nhận provider hợp lệ + preset thuộc biz hoặc preset hệ thống.
// Cấu hình được SAO CHÉP vào key ngay lúc tạo (đúng quy tắc Done.vn).
async function snapshotPresets(bizId: string, input: unknown): Promise<{
  presets: Record<string, string>;
  config: Record<string, string[] | string>;
}> {
  const presets: Record<string, string> = {};
  const config: Record<string, string[] | string> = {};
  if (!input || typeof input !== "object") return { presets, config };
  const provided = input as Record<string, unknown>;
  for (const provider of PRESET_PROVIDERS) {
    const id = provided[provider.key];
    if (typeof id !== "string" || !id) continue;
    const presetConfig = await loadPresetConfig(bizId, provider.key, id);
    if (!presetConfig) continue;
    presets[provider.key] = id;
    Object.assign(config, snapshotConfig(provider.key, presetConfig));
  }
  return { presets, config };
}

async function sanitizeSkillIds(bizId: string, input: unknown): Promise<string[]> {
  if (!Array.isArray(input)) return [];
  const ids = Array.from(new Set(input.map(String))).slice(0, 20);
  if (!ids.length) return [];
  const rows = await db.select({ id: schema.skills.id }).from(schema.skills)
    .where(and(eq(schema.skills.bizId, bizId), inArray(schema.skills.id, ids)));
  return rows.map((r) => r.id);
}

// Skill Hub — upload .zip/.skill, xem/sửa mô tả, bật/tắt, xoá.
// Đúng nguyên tắc done.vn: description quyết định AI có dùng skill hay không.
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { parseSkillPackage } from "@/lib/skill-package";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

async function allowed(slug: string) {
  const m = await getMembership(slug);
  if (!m) return null;
  const perms = m.member.permissions as string[];
  return m.member.role === "owner" || perms.includes("mcp_keys.access") || perms.includes("mcp_server.access") ? m : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.select().from(schema.skills)
    .where(eq(schema.skills.bizId, m.biz.id)).orderBy(desc(schema.skills.createdAt));
  const keys = await db.select({ id: schema.mcpKeys.id, name: schema.mcpKeys.name, skillIds: schema.mcpKeys.skillIds })
    .from(schema.mcpKeys).where(eq(schema.mcpKeys.bizId, m.biz.id));
  return Response.json(rows.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    platforms: s.platforms,
    fileName: s.fileName,
    enabled: s.enabled,
    createdAt: s.createdAt,
    size: s.content.length,
    usedBy: keys.filter((k) => (k.skillIds as string[]).includes(s.id)).map((k) => k.name),
  })));
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Thiếu file .zip / .skill" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "File tối đa 5MB" }, { status: 400 });

  let parsed;
  try {
    parsed = parseSkillPackage(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Không đọc được gói skill" }, { status: 400 });
  }

  const description = String(form?.get("description") ?? "") || parsed.description;
  const platforms = String(form?.get("platforms") ?? "")
    .split(",").map((p) => p.trim()).filter(Boolean);

  const [row] = await db.insert(schema.skills).values({
    bizId: m.biz.id,
    name: parsed.name,
    description,
    platforms: platforms.length ? platforms : parsed.platforms,
    fileName: parsed.fileName,
    enabled: true,
    content: parsed.content,
  }).returning();
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "skill.upload", objectType: "skill", objectId: row.id, detail: { name: row.name, fileName: row.fileName } });
  return Response.json({ id: row.id, name: row.name, description: row.description });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return Response.json({ error: "Thiếu id" }, { status: 400 });
  const [row] = await db.select().from(schema.skills).where(eq(schema.skills.id, String(b.id))).limit(1);
  if (!row || row.bizId !== m.biz.id) return Response.json({ error: "Không tìm thấy skill" }, { status: 404 });
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 120);
  if (b.description !== undefined) patch.description = String(b.description).trim();
  if (b.platforms !== undefined) patch.platforms = Array.isArray(b.platforms) ? b.platforms.map(String) : [];
  if (b.enabled !== undefined) patch.enabled = Boolean(b.enabled);
  await db.update(schema.skills).set(patch).where(eq(schema.skills.id, row.id));
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "skill.update", objectType: "skill", objectId: row.id });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Thiếu id" }, { status: 400 });
  const [row] = await db.select().from(schema.skills).where(eq(schema.skills.id, id)).limit(1);
  if (!row || row.bizId !== m.biz.id) return Response.json({ error: "Không tìm thấy skill" }, { status: 404 });
  await db.delete(schema.skills).where(eq(schema.skills.id, id));
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "skill.delete", objectType: "skill", objectId: id });
  return Response.json({ ok: true });
}

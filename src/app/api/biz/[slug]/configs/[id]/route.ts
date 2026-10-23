import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  return m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("jobs.access")) ? m : null;
}

// PATCH — toggle on/off hoặc sửa params
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.status) patch.status = body.status === "on" ? "on" : "off";
  if (body.params) patch.params = body.params;
  if (body.name) patch.name = String(body.name).trim();
  const rows = await db.update(schema.configs).set(patch as any)
    .where(and(eq(schema.configs.id, id), eq(schema.configs.bizId, m.biz.id))).returning();
  if (!rows.length) return Response.json({ error: "not_found" }, { status: 404 });
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "config.update", objectType: "config", objectId: id, detail: patch as Record<string, unknown> });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.delete(schema.configs)
    .where(and(eq(schema.configs.id, id), eq(schema.configs.bizId, m.biz.id))).returning();
  if (!rows.length) return Response.json({ error: "not_found" }, { status: 404 });
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "config.delete", objectType: "config", objectId: id });
  return Response.json({ ok: true });
}

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const upd: Record<string, unknown> = {};
  if (body.name !== undefined) upd.name = body.name;
  if (body.status && ["active", "paused", "revoked"].includes(body.status)) upd.status = body.status;
  if (body.expiresAt !== undefined) upd.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  const [k] = await db.update(schema.mcpKeys).set(upd)
    .where(and(eq(schema.mcpKeys.id, id), eq(schema.mcpKeys.bizId, m.biz.id))).returning();
  if (!k) return Response.json({ error: "not_found" }, { status: 404 });
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "mcp_key.update", objectType: "mcp_key", objectId: id, detail: upd });
  return Response.json({ id: k.id, status: k.status });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const [k] = await db.delete(schema.mcpKeys)
    .where(and(eq(schema.mcpKeys.id, id), eq(schema.mcpKeys.bizId, m.biz.id))).returning();
  if (!k) return Response.json({ error: "not_found" }, { status: 404 });
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "mcp_key.delete", objectType: "mcp_key", objectId: id });
  return Response.json({ ok: true });
}

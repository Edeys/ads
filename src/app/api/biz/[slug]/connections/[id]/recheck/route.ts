import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { checkHealth, readSecret } from "@/lib/providers";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

// POST /api/biz/:slug/connections/:id/recheck — chạy health check ngay
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  const allowed = m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("credentials.access"));
  if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });

  const [conn] = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.id, id), eq(schema.connections.bizId, m!.biz.id))).limit(1);
  if (!conn) return Response.json({ error: "not_found" }, { status: 404 });

  const secret = (conn.secret as any)?.enc ? readSecret((conn.secret as any).enc) : {};
  const result = await checkHealth({ provider: conn.provider, secret, meta: conn.meta as Record<string, unknown> });
  await db.update(schema.connections).set({
    health: result.health,
    lastCheckedAt: new Date(),
    meta: { ...(conn.meta as object), ...(result.meta ?? {}) },
  }).where(eq(schema.connections.id, id));
  await logActivity({ bizId: m!.biz.id, actorId: m!.member.userId, action: "connection.recheck", objectType: "connection", objectId: id, detail: { health: result.health } });
  return Response.json(result);
}

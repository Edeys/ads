import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  const allowed = m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("auto_pause.access"));
  if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.delete(schema.cpaThresholds)
    .where(and(eq(schema.cpaThresholds.id, id), eq(schema.cpaThresholds.bizId, m!.biz.id))).returning();
  if (!rows.length) return Response.json({ error: "not_found" }, { status: 404 });
  await logActivity({ bizId: m!.biz.id, actorId: m!.member.userId, action: "cpa.delete", objectType: "cpa_threshold", objectId: id });
  return Response.json({ ok: true });
}

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

// DELETE /api/biz/:slug/invites/:id — thu hồi lời mời
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  if (!isOwner && !perms.includes("team.manage")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const [row] = await db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.id, id), eq(schema.invites.bizId, m.biz.id)))
    .limit(1);

  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  await db.delete(schema.invites).where(eq(schema.invites.id, id));

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "invite.revoke",
    objectType: "invite",
    objectId: id,
    detail: { email: row.email },
  });

  return Response.json({ ok: true });
}

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import type { Permission } from "@/db/schema";
import { PERMISSIONS } from "@/db/schema";

export const runtime = "nodejs";

// PATCH /api/biz/:slug/members/:id — sửa quyền thành viên
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  if (!isOwner && !perms.includes("team.manage")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const [target] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.id, id), eq(schema.members.bizId, m.biz.id)))
    .limit(1);

  if (!target) return Response.json({ error: "not_found" }, { status: 404 });
  if (target.role === "owner") {
    return Response.json({ error: "cannot_modify_owner" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.permissions)) {
    return Response.json({ error: "permissions_must_be_array" }, { status: 400 });
  }

  const validPerms = body.permissions.filter((p: string): p is Permission =>
    PERMISSIONS.includes(p as Permission)
  );

  await db
    .update(schema.members)
    .set({ permissions: validPerms })
    .where(eq(schema.members.id, id));

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "member.update_permissions",
    objectType: "member",
    objectId: id,
    detail: { permissions: validPerms },
  });

  return Response.json({ ok: true });
}

// DELETE /api/biz/:slug/members/:id — xoá thành viên khỏi Biz
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  if (!isOwner && !perms.includes("team.manage")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const [target] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.id, id), eq(schema.members.bizId, m.biz.id)))
    .limit(1);

  if (!target) return Response.json({ error: "not_found" }, { status: 404 });
  if (target.role === "owner") {
    return Response.json({ error: "cannot_remove_owner" }, { status: 400 });
  }

  await db.delete(schema.members).where(eq(schema.members.id, id));

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "member.remove",
    objectType: "member",
    objectId: id,
    detail: { userId: target.userId },
  });

  return Response.json({ ok: true });
}

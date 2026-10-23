import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

// POST /api/invites/:id/accept — chấp nhận lời mời tham gia Biz
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  const email = session?.user?.email?.trim().toLowerCase();
  if (!userId || !email) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [invite] = await db
    .select()
    .from(schema.invites)
    .where(and(eq(schema.invites.id, id), eq(schema.invites.status, "pending")))
    .limit(1);

  if (!invite) return Response.json({ error: "Lời mời không tồn tại hoặc đã được xử lý" }, { status: 404 });

  if (invite.email.trim().toLowerCase() !== email) {
    return Response.json(
      { error: "email_mismatch", invitedEmail: invite.email, currentEmail: email },
      { status: 403 },
    );
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    await db.update(schema.invites).set({ status: "expired" }).where(eq(schema.invites.id, id));
    return Response.json({ error: "Lời mời đã hết hạn" }, { status: 400 });
  }

  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.id, invite.bizId)).limit(1);
  if (!biz) return Response.json({ error: "Biz không tồn tại" }, { status: 404 });

  // Kiểm tra đã là thành viên chưa
  const [existing] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.bizId, invite.bizId), eq(schema.members.userId, userId)))
    .limit(1);

  if (!existing) {
    await db.insert(schema.members).values({
      bizId: invite.bizId,
      userId,
      role: "member",
      permissions: invite.permissions,
    });
  }

  await db.update(schema.invites).set({ status: "accepted" }).where(eq(schema.invites.id, id));

  await logActivity({
    bizId: invite.bizId,
    actorId: userId,
    action: "invite.accept",
    objectType: "invite",
    objectId: id,
    detail: { email: invite.email },
  });

  return Response.json({ ok: true, slug: biz.slug });
}

// Thành viên — bảng giống Done.vn: Thành viên · Vai trò · Quyền · Tham gia · Hoạt động.
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { desc, eq, sql } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { MembersClient } from "./client";

export const dynamic = "force-dynamic";

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const isOwner = m.member.role === "owner";
  const canManage = isOwner || (m.member.permissions as string[]).includes("team.manage");

  const rows = await db
    .select({
      id: schema.members.id,
      userId: schema.members.userId,
      role: schema.members.role,
      permissions: schema.members.permissions,
      createdAt: schema.members.createdAt,
      email: schema.users.email,
      name: schema.users.name,
      image: schema.users.image,
    })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
    .where(eq(schema.members.bizId, m.biz.id))
    .orderBy(desc(schema.members.createdAt));

  // "Hoạt động" = lần ghi nhật ký gần nhất của user trong Biz này
  const lastActs = await db
    .select({ actorId: schema.activityLogs.actorId, last: sql<Date>`max(${schema.activityLogs.createdAt})` })
    .from(schema.activityLogs)
    .where(eq(schema.activityLogs.bizId, m.biz.id))
    .groupBy(schema.activityLogs.actorId);
  const lastByUser = new Map(lastActs.filter((a) => a.actorId).map((a) => [a.actorId as string, a.last]));

  const pendingInvites = await db
    .select({ id: schema.invites.id, email: schema.invites.email, createdAt: schema.invites.createdAt })
    .from(schema.invites)
    .where(eq(schema.invites.bizId, m.biz.id));

  return (
    <MembersClient
      slug={slug}
      currentUserId={m.member.userId}
      canManage={canManage}
      members={rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        role: r.role,
        permissions: (r.permissions ?? []) as string[],
        createdAt: r.createdAt.toISOString(),
        email: r.email,
        name: r.name,
        image: r.image,
        lastSeenAt: lastByUser.get(r.userId) ? new Date(lastByUser.get(r.userId) as Date).toISOString() : null,
      }))}
      pendingInvites={pendingInvites.map((i) => ({
        id: i.id,
        email: i.email,
        createdAt: i.createdAt.toISOString(),
      }))}
    />
  );
}

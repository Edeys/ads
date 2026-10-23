// Cài đặt Biz — thông tin Biz, thành viên, lời mời (dùng lại SettingsClient đã có).
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { SettingsClient } from "../../dashboard/settings/client";

export const dynamic = "force-dynamic";

export default async function BizSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  const canManage = isOwner || perms.includes("team.manage");

  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.id, m.biz.id)).limit(1);
  if (!biz) redirect("/login");

  const [membersList, invitesList] = await Promise.all([
    db
      .select({
        id: schema.members.id,
        userId: schema.members.userId,
        role: schema.members.role,
        permissions: schema.members.permissions,
        createdAt: schema.members.createdAt,
        userEmail: schema.users.email,
        userName: schema.users.name,
        userImage: schema.users.image,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
      .where(eq(schema.members.bizId, m.biz.id))
      .orderBy(desc(schema.members.createdAt)),

    db
      .select()
      .from(schema.invites)
      .where(eq(schema.invites.bizId, m.biz.id))
      .orderBy(desc(schema.invites.createdAt)),
  ]);

  return (
    <SettingsClient
      slug={slug}
      isOwner={isOwner}
      canManage={canManage}
      currentUserId={m.member.userId}
      biz={{
        id: biz.id,
        slug: biz.slug,
        name: biz.name,
        isPersonal: biz.isPersonal,
        vatTaxCode: biz.vatTaxCode,
        vatCompanyName: biz.vatCompanyName,
        vatCompanyAddress: biz.vatCompanyAddress,
        createdAt: biz.createdAt.toISOString(),
      }}
      members={membersList.map((x) => ({ ...x, createdAt: x.createdAt.toISOString() }))}
      invites={invitesList.map((x) => ({
        ...x,
        createdAt: x.createdAt.toISOString(),
        expiresAt: x.expiresAt?.toISOString() ?? null,
      }))}
    />
  );
}

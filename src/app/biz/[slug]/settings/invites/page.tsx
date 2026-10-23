// Lời mời — tạo lời mời kèm bộ quyền, thu hồi, xem trạng thái.
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { InvitesClient } from "./client";

export const dynamic = "force-dynamic";

export default async function InvitesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const isOwner = m.member.role === "owner";
  const canManage = isOwner || (m.member.permissions as string[]).includes("team.manage");
  if (!canManage) redirect(`/biz/${slug}/settings/members`);

  const invites = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.bizId, m.biz.id))
    .orderBy(desc(schema.invites.createdAt));

  const members = await db
    .select({ email: schema.users.email, role: schema.members.role })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
    .where(eq(schema.members.bizId, m.biz.id));

  return (
    <InvitesClient
      slug={slug}
      invites={invites.map((i) => ({
        id: i.id,
        email: i.email,
        permissions: (i.permissions ?? []) as string[],
        status: i.status,
        expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
        createdAt: i.createdAt.toISOString(),
      }))}
      existingEmails={[...members.map((x) => x.email), ...invites.filter((i) => i.status === "pending").map((i) => i.email)]}
    />
  );
}

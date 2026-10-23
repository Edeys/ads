// Nhật ký 30 ngày — spec §5.9: filter hành động + trạng thái.
import { db, schema } from "@/db";
import { and, eq, desc, gte } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { ActivityClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const since = new Date(Date.now() - 30 * 86400_000);
  const rows = await db.select({
    id: schema.activityLogs.id,
    action: schema.activityLogs.action,
    status: schema.activityLogs.status,
    objectType: schema.activityLogs.objectType,
    objectId: schema.activityLogs.objectId,
    detail: schema.activityLogs.detail,
    createdAt: schema.activityLogs.createdAt,
    actorEmail: schema.users.email,
  }).from(schema.activityLogs)
    .leftJoin(schema.users, eq(schema.activityLogs.actorId, schema.users.id))
    .where(and(eq(schema.activityLogs.bizId, m.biz.id), gte(schema.activityLogs.createdAt, since)))
    .orderBy(desc(schema.activityLogs.createdAt))
    .limit(500);

  return <ActivityClient rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} />;
}

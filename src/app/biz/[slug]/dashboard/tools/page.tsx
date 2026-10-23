// Custom tools — Tool SDK: khai báo tool HTTP bằng manifest, chạy thử, bật/tắt.
import { db, schema } from "@/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { ToolsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ToolsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const canManage = m.member.role === "owner" || (m.member.permissions as string[]).includes("mcp_keys.access");
  const rows = await db
    .select()
    .from(schema.customTools)
    .where(eq(schema.customTools.bizId, m.biz.id))
    .orderBy(asc(schema.customTools.createdAt));

  const runs = await db
    .select({
      id: schema.activityLogs.id,
      status: schema.activityLogs.status,
      objectId: schema.activityLogs.objectId,
      detail: schema.activityLogs.detail,
      createdAt: schema.activityLogs.createdAt,
    })
    .from(schema.activityLogs)
    .where(and(eq(schema.activityLogs.bizId, m.biz.id), eq(schema.activityLogs.action, "custom_tool.run")))
    .orderBy(desc(schema.activityLogs.createdAt))
    .limit(20);

  return (
    <ToolsClient
      slug={slug}
      canManage={canManage}
      tools={rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }))}
      runs={runs.map((r) => ({
        id: r.id,
        status: r.status,
        objectId: r.objectId,
        detail: r.detail as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}

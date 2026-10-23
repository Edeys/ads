// Tự động hoá — spec §5.3: filter tabs 4 loại + list + "Thêm cấu hình" modal.
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { ConfigsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ConfigsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { slug } = await params;
  const { filter } = await searchParams;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];

  // ?filter=auto-pause|auto-run|budget|metrics (giống Done.vn) → type nội bộ
  const FILTER_TO_TYPE: Record<string, string> = {
    "auto-pause": "auto_pause",
    "auto-run": "post_trigger",
    budget: "budget_schedule",
    metrics: "metrics_pull",
  };
  const initialFilter = filter ? (FILTER_TO_TYPE[filter] ?? "all") : "all";

  const [configs, conns, thresholds] = await Promise.all([
    db.select().from(schema.configs).where(eq(schema.configs.bizId, m.biz.id)).orderBy(desc(schema.configs.createdAt)),
    db.select({ id: schema.connections.id, provider: schema.connections.provider, name: schema.connections.name, meta: schema.connections.meta, health: schema.connections.health })
      .from(schema.connections).where(eq(schema.connections.bizId, m.biz.id)),
    db.select().from(schema.cpaThresholds).where(eq(schema.cpaThresholds.bizId, m.biz.id)),
  ]);

  return (
    <ConfigsClient
      slug={slug}
      canManage={isOwner || perms.includes("jobs.access")}
      initialFilter={initialFilter}
      configs={configs.map((c) => ({ ...c, lastRunAt: c.lastRunAt?.toISOString() ?? null, createdAt: c.createdAt.toISOString() }))}
      connections={conns}
      thresholds={thresholds.map((t) => ({ id: t.id, name: t.name, platform: t.platform }))}
    />
  );
}

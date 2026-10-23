// Tổng quan — 4 stat cards + onboarding checklist 5 bước (spec §5.1)
import { db, schema } from "@/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardClient } from "./client";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const bizId = m.biz.id;
  const now = new Date();
  const sinceMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const session = await auth();
  const displayName = session?.user?.name || session?.user?.email?.split("@")[0] || "bạn";

  const [configs, conns, cpaThresholds, mcpKeys, aiUsageRows, recentLogs] = await Promise.all([
    db.select().from(schema.configs).where(eq(schema.configs.bizId, bizId)),
    db.select().from(schema.connections).where(eq(schema.connections.bizId, bizId)),
    db.select().from(schema.cpaThresholds).where(eq(schema.cpaThresholds.bizId, bizId)),
    db.select().from(schema.mcpKeys).where(eq(schema.mcpKeys.bizId, bizId)),
    db
      .select({
        tokens: sql<number>`coalesce(sum(${schema.aiUsages.tokensIn} + ${schema.aiUsages.tokensOut}), 0)::int`,
        usd: sql<number>`coalesce(sum(${schema.aiUsages.costUsd}), 0)::float`,
      })
      .from(schema.aiUsages)
      .where(and(eq(schema.aiUsages.bizId, bizId), gte(schema.aiUsages.createdAt, sinceMonth))),
    db
      .select({
        id: schema.activityLogs.id,
        action: schema.activityLogs.action,
        status: schema.activityLogs.status,
        objectType: schema.activityLogs.objectType,
        createdAt: schema.activityLogs.createdAt,
        actorEmail: schema.users.email,
      })
      .from(schema.activityLogs)
      .leftJoin(schema.users, eq(schema.activityLogs.actorId, schema.users.id))
      .where(eq(schema.activityLogs.bizId, bizId))
      .orderBy(desc(schema.activityLogs.createdAt))
      .limit(5),
  ]);

  const activeConfigs = configs.filter((c) => c.status === "on").length;
  const errorConfigs = configs.filter((c) => c.status === "error" || c.lastRunStatus === "error").length;
  const healthyConns = conns.filter((c) => c.health === "ok").length;
  const aiCostUsd = aiUsageRows[0]?.usd ?? 0;
  const aiTokens = aiUsageRows[0]?.tokens ?? 0;

  const hasAdConn = conns.some((c) => ["meta_ads", "tiktok_ads", "google_ads"].includes(c.provider));
  const hasSheetsConn = conns.some((c) => c.provider === "google_sheets");
  const hasMetricsPull = configs.some((c) => c.type === "metrics_pull");
  const hasAutoPause = configs.some((c) => c.type === "auto_pause") || cpaThresholds.length > 0;
  const hasMcpKey = mcpKeys.length > 0;

  const checklist = [
    {
      step: 1,
      title: "Kết nối TKQC",
      desc: "Meta Ads, TikTok Ads hoặc Google Ads",
      done: hasAdConn,
      href: `/biz/${slug}/dashboard/connections`,
      cta: "Kết nối ngay",
    },
    {
      step: 2,
      title: "Kết nối Google Sheets",
      desc: "Gắn Service Account Google để lưu dữ liệu",
      done: hasSheetsConn,
      href: `/biz/${slug}/dashboard/connections`,
      cta: "Kết nối Sheets",
    },
    {
      step: 3,
      title: "Tạo cấu hình kéo chỉ số",
      desc: "Tự động đồng bộ số liệu chiến dịch theo chu kỳ",
      done: hasMetricsPull,
      href: `/biz/${slug}/dashboard/configs`,
      cta: "Tạo cấu hình",
    },
    {
      step: 4,
      title: "Bật Ads Autopilot",
      desc: "Tạo ngưỡng CPA để tự động tắt ads lãng phí",
      done: hasAutoPause,
      href: `/biz/${slug}/dashboard/cpa`,
      cta: "Thiết lập CPA",
    },
    {
      step: 5,
      title: "Tạo MCP API Key",
      desc: "Kết nối Claude Desktop hoặc Cursor với tài khoản",
      done: hasMcpKey,
      href: `/biz/${slug}/dashboard/mcp-keys`,
      cta: "Tạo Key MCP",
    },
  ];

  return (
    <DashboardClient
      slug={slug}
      bizName={m.biz.name}
      userName={displayName}
      stats={{
        activeConfigs,
        totalConfigs: configs.length,
        errorConfigs,
        healthyConns,
        totalConns: conns.length,
        aiCostUsd,
        aiTokens,
      }}
      checklist={checklist}
      automations={configs.slice(0, 4).map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        lastRunAt: c.lastRunAt ? c.lastRunAt.toISOString() : null,
      }))}
      recentActivity={recentLogs.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}

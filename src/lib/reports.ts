// Tổng hợp số liệu cho trang Báo cáo — mô phỏng shape API của Done.vn.
import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import { db, schema } from "@/db";

export const REPORT_PRESETS = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "last3", label: "3 ngày qua" },
  { value: "last7", label: "7 ngày qua" },
  { value: "last30", label: "30 ngày qua" },
  { value: "this_month", label: "Tháng này" },
  { value: "last_month", label: "Tháng trước" },
  { value: "this_year", label: "Năm nay" },
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number]["value"] | "custom";

export type ReportRange = {
  preset: ReportPreset;
  label: string;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
};

const DAY = 86_400_000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * DAY);
}

/** Tính khoảng thời gian + kỳ trước. `custom` cần from/to dạng YYYY-MM-DD. */
export function resolveRange(preset: string | undefined, from?: string, to?: string): ReportRange {
  const now = new Date();
  const today = startOfDay(now);
  let start = today;
  let end = endOfDay(now);
  let label = "7 ngày qua";

  switch (preset) {
    case "today":
      label = "Hôm nay";
      break;
    case "yesterday":
      start = addDays(today, -1);
      end = endOfDay(start);
      label = "Hôm qua";
      break;
    case "last3":
      start = addDays(today, -2);
      label = "3 ngày qua";
      break;
    case "last30":
      start = addDays(today, -29);
      label = "30 ngày qua";
      break;
    case "this_month":
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      label = "Tháng này";
      break;
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      start = first;
      end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
      label = "Tháng trước";
      break;
    }
    case "this_year":
      start = new Date(today.getFullYear(), 0, 1);
      label = "Năm nay";
      break;
    case "custom": {
      const f = from ? new Date(`${from}T00:00:00`) : today;
      const t = to ? new Date(`${to}T23:59:59`) : now;
      if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) {
        start = startOfDay(f);
        end = endOfDay(t);
      }
      label = `${start.toLocaleDateString("vi-VN")} – ${end.toLocaleDateString("vi-VN")}`;
      break;
    }
    default:
      start = addDays(today, -6);
      label = "7 ngày qua";
  }

  const span = Math.max(1, end.getTime() - start.getTime());
  return {
    preset: (preset as ReportPreset) || "last7",
    label,
    from: start,
    to: end,
    prevFrom: new Date(start.getTime() - span),
    prevTo: new Date(start.getTime() - 1),
  };
}

const n = (v: unknown) => Number(v ?? 0);

async function scalar(q: PromiseLike<{ n: unknown }[]>) {
  const rows = await q;
  return n(rows[0]?.n);
}

export type ReportKpi = {
  key: string;
  label: string;
  value: number;
  text?: string | null;
  unit?: "count" | "currency" | "percent" | "ms";
  hint?: string;
};

export type ReportBlock = {
  key: string;
  title: string;
  description?: string;
  href?: string;
  hrefLabel?: string;
  metrics: ReportKpi[];
  table?: { columns: string[]; rows: (string | number)[][] };
  empty?: string;
};

export type OverviewReport = {
  range: { preset: string; label: string; from: string; to: string };
  summary: {
    events: number;
    errors: number;
    configsTotal: number;
    configsActive: number;
    configsFailing: number;
    connectionsHealthy: number;
    connectionsTotal: number;
    mcpCalls: number;
    aiCostUsd: number;
  };
};

export async function getOverview(bizId: string, range: ReportRange): Promise<OverviewReport> {
  const from = range.from;
  const to = range.to;

  const [configsTotal, configsActive, configsFailing, connectionsTotal, connectionsHealthy, mcp, ai, dataRuns, postEvents, activityCount, runErrors] =
    await Promise.all([
      scalar(db.select({ n: sql`count(*)::int` }).from(schema.configs).where(eq(schema.configs.bizId, bizId))),
      scalar(
        db
          .select({ n: sql`count(*)::int` })
          .from(schema.configs)
          .where(and(eq(schema.configs.bizId, bizId), eq(schema.configs.status, "on"))),
      ),
      scalar(
        db
          .select({ n: sql`count(*)::int` })
          .from(schema.configs)
          .where(and(eq(schema.configs.bizId, bizId), eq(schema.configs.status, "error"))),
      ),
      scalar(db.select({ n: sql`count(*)::int` }).from(schema.connections).where(eq(schema.connections.bizId, bizId))),
      scalar(
        db
          .select({ n: sql`count(*)::int` })
          .from(schema.connections)
          .where(and(eq(schema.connections.bizId, bizId), eq(schema.connections.health, "ok"))),
      ),
      db
        .select({
          calls: sql`count(*)::int`,
          errors: sql`count(*) filter (where not ${schema.mcpCallLogs.ok})::int`,
        })
        .from(schema.mcpCallLogs)
        .innerJoin(schema.mcpKeys, eq(schema.mcpCallLogs.keyId, schema.mcpKeys.id))
        .where(
          and(
            eq(schema.mcpKeys.bizId, bizId),
            gte(schema.mcpCallLogs.createdAt, from),
            lte(schema.mcpCallLogs.createdAt, to),
          ),
        ),
      db
        .select({
          calls: sql`count(*)::int`,
          usd: sql`coalesce(sum(${schema.aiUsages.costUsd}),0)::bigint`,
        })
        .from(schema.aiUsages)
        .where(and(eq(schema.aiUsages.bizId, bizId), gte(schema.aiUsages.createdAt, from), lte(schema.aiUsages.createdAt, to))),
      scalar(
        db
          .select({ n: sql`count(*)::int` })
          .from(schema.configRuns)
          .innerJoin(schema.configs, eq(schema.configRuns.configId, schema.configs.id))
          .where(
            and(eq(schema.configs.bizId, bizId), gte(schema.configRuns.startedAt, from), lte(schema.configRuns.startedAt, to)),
          ),
      ),
      scalar(
        db
          .select({ n: sql`count(*)::int` })
          .from(schema.commentEvents)
          .where(
            and(eq(schema.commentEvents.bizId, bizId), gte(schema.commentEvents.createdAt, from), lte(schema.commentEvents.createdAt, to)),
          ),
      ),
      scalar(
        db
          .select({ n: sql`count(*)::int` })
          .from(schema.activityLogs)
          .where(and(eq(schema.activityLogs.bizId, bizId), gte(schema.activityLogs.createdAt, from), lte(schema.activityLogs.createdAt, to))),
      ),
      scalar(
        db
          .select({ n: sql`count(*)::int` })
          .from(schema.configRuns)
          .innerJoin(schema.configs, eq(schema.configRuns.configId, schema.configs.id))
          .where(
            and(
              eq(schema.configs.bizId, bizId),
              eq(schema.configRuns.status, "error"),
              gte(schema.configRuns.startedAt, from),
              lte(schema.configRuns.startedAt, to),
            ),
          ),
      ),
    ]);

  const events = dataRuns + postEvents + n(mcp[0]?.calls) + n(ai[0]?.calls) + activityCount;
  const errors = n(mcp[0]?.errors) + runErrors;

  return {
    range: { preset: range.preset, label: range.label, from: range.from.toISOString(), to: range.to.toISOString() },
    summary: {
      events,
      errors,
      configsTotal,
      configsActive,
      configsFailing,
      connectionsHealthy,
      connectionsTotal,
      mcpCalls: n(mcp[0]?.calls),
      aiCostUsd: n(ai[0]?.usd) / 1_000_000,
    },
  };
}

export type BizReport = {
  range: { preset: string; label: string; from: string; to: string };
  headline: ReportKpi[];
  blocks: ReportBlock[];
};

export async function getBizReport(bizId: string, range: ReportRange): Promise<BizReport> {
  const from = range.from;
  const to = range.to;
  const inRange = (col: Column) => and(gte(col, from), lte(col, to));

  const [
    configsByType,
    runs,
    apActions,
    connectionsByHealth,
    mcpAgg,
    mcpTopTools,
    activeKeys,
    aiAgg,
    aiByModel,
    activityCount,
    triggers,
    templates,
    cpaCount,
    postsByStatus,
    membersCount,
    invitesPending,
    plan,
    invoices,
    commentsCount,
  ] = await Promise.all([
    db
      .select({ type: schema.configs.type, total: sql<number>`count(*)::int`, on: sql<number>`count(*) filter (where ${schema.configs.status}='on')::int`, err: sql<number>`count(*) filter (where ${schema.configs.status}='error')::int` })
      .from(schema.configs)
      .where(eq(schema.configs.bizId, bizId))
      .groupBy(schema.configs.type),
    db
      .select({
        type: schema.configs.type,
        runs: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${schema.configRuns.status}='error')::int`,
      })
      .from(schema.configRuns)
      .innerJoin(schema.configs, eq(schema.configRuns.configId, schema.configs.id))
      .where(and(eq(schema.configs.bizId, bizId), inRange(schema.configRuns.startedAt)))
      .groupBy(schema.configs.type),
    db
      .select({
        total: sql<number>`count(*)::int`,
        paused: sql<number>`count(*) filter (where ${schema.autopilotActions.action}='paused')::int`,
        kept: sql<number>`count(*) filter (where ${schema.autopilotActions.action}='kept_by_ai')::int`,
        tokens: sql<number>`coalesce(sum(coalesce(${schema.autopilotActions.aiTokensIn},0)+coalesce(${schema.autopilotActions.aiTokensOut},0)),0)::int`,
      })
      .from(schema.autopilotActions)
      .innerJoin(schema.configs, eq(schema.autopilotActions.configId, schema.configs.id))
      .where(and(eq(schema.configs.bizId, bizId), inRange(schema.autopilotActions.createdAt))),
    db
      .select({ health: schema.connections.health, total: sql<number>`count(*)::int` })
      .from(schema.connections)
      .where(eq(schema.connections.bizId, bizId))
      .groupBy(schema.connections.health),
    db
      .select({
        calls: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where not ${schema.mcpCallLogs.ok})::int`,
        avgMs: sql<number>`coalesce(avg(${schema.mcpCallLogs.latencyMs}),0)::int`,
      })
      .from(schema.mcpCallLogs)
      .innerJoin(schema.mcpKeys, eq(schema.mcpCallLogs.keyId, schema.mcpKeys.id))
      .where(and(eq(schema.mcpKeys.bizId, bizId), inRange(schema.mcpCallLogs.createdAt))),
    db
      .select({ tool: schema.mcpCallLogs.tool, calls: sql<number>`count(*)::int` })
      .from(schema.mcpCallLogs)
      .innerJoin(schema.mcpKeys, eq(schema.mcpCallLogs.keyId, schema.mcpKeys.id))
      .where(and(eq(schema.mcpKeys.bizId, bizId), inRange(schema.mcpCallLogs.createdAt)))
      .groupBy(schema.mcpCallLogs.tool)
      .orderBy(sql`count(*) desc`)
      .limit(5),
    scalar(
      db
        .select({ n: sql`count(*)::int` })
        .from(schema.mcpKeys)
        .where(and(eq(schema.mcpKeys.bizId, bizId), eq(schema.mcpKeys.status, "active"))),
    ),
    db
      .select({
        calls: sql<number>`count(*)::int`,
        tin: sql<number>`coalesce(sum(${schema.aiUsages.tokensIn}),0)::int`,
        tout: sql<number>`coalesce(sum(${schema.aiUsages.tokensOut}),0)::int`,
        usd: sql<number>`coalesce(sum(${schema.aiUsages.costUsd}),0)::bigint`,
      })
      .from(schema.aiUsages)
      .where(and(eq(schema.aiUsages.bizId, bizId), inRange(schema.aiUsages.createdAt))),
    db
      .select({
        model: schema.aiUsages.model,
        calls: sql<number>`count(*)::int`,
        tin: sql<number>`coalesce(sum(${schema.aiUsages.tokensIn}),0)::int`,
        tout: sql<number>`coalesce(sum(${schema.aiUsages.tokensOut}),0)::int`,
      })
      .from(schema.aiUsages)
      .where(and(eq(schema.aiUsages.bizId, bizId), inRange(schema.aiUsages.createdAt)))
      .groupBy(schema.aiUsages.model),
    scalar(
      db
        .select({ n: sql`count(*)::int` })
        .from(schema.activityLogs)
        .where(and(eq(schema.activityLogs.bizId, bizId), inRange(schema.activityLogs.createdAt))),
    ),
    db
      .select({ total: sql<number>`count(*)::int`, on: sql<number>`count(*) filter (where ${schema.configs.status}='on')::int` })
      .from(schema.configs)
      .where(and(eq(schema.configs.bizId, bizId), eq(schema.configs.type, "post_trigger"))),
    scalar(db.select({ n: sql`count(*)::int` }).from(schema.adTemplates).where(eq(schema.adTemplates.bizId, bizId))),
    scalar(db.select({ n: sql`count(*)::int` }).from(schema.cpaThresholds).where(eq(schema.cpaThresholds.bizId, bizId))),
    db
      .select({ status: schema.scheduledPosts.status, total: sql<number>`count(*)::int` })
      .from(schema.scheduledPosts)
      .where(eq(schema.scheduledPosts.bizId, bizId))
      .groupBy(schema.scheduledPosts.status),
    scalar(db.select({ n: sql`count(*)::int` }).from(schema.members).where(eq(schema.members.bizId, bizId))),
    scalar(
      db
        .select({ n: sql`count(*)::int` })
        .from(schema.invites)
        .where(and(eq(schema.invites.bizId, bizId), eq(schema.invites.status, "pending"))),
    ),
    db.select().from(schema.plans).where(eq(schema.plans.bizId, bizId)).limit(1),
    db.select().from(schema.invoices).where(eq(schema.invoices.bizId, bizId)),
    scalar(
      db
        .select({ n: sql`count(*)::int` })
        .from(schema.commentEvents)
        .where(and(eq(schema.commentEvents.bizId, bizId), inRange(schema.commentEvents.createdAt))),
    ),
  ]);

  const cfg = new Map(configsByType.map((r) => [r.type, r]));
  const run = new Map(runs.map((r) => [r.type, r]));
  const ap = apActions[0] ?? { total: 0, paused: 0, kept: 0, tokens: 0 };
  const mcp = mcpAgg[0] ?? { calls: 0, errors: 0, avgMs: 0 };
  const ai = aiAgg[0] ?? { calls: 0, tin: 0, tout: 0, usd: 0 };
  const conn = new Map(connectionsByHealth.map((r) => [r.health, r.total]));
  const postMap = new Map(postsByStatus.map((r) => [r.status, r.total]));

  const errs = (t: string) => n(cfg.get(t)?.err);
  const totalRuns = runs.reduce((a, r) => a + n(r.runs), 0);
  const errorRuns = runs.reduce((a, r) => a + n(r.errors), 0);

  const headline: ReportKpi[] = [
    { key: "runs", label: "Sự kiện ghi nhận", value: totalRuns + n(commentsCount) + n(mcp.calls) + activityCount, unit: "count", hint: "Lượt chạy cấu hình, bình luận, gọi MCP và thao tác được ghi trong kỳ." },
    { key: "errors", label: "Sự kiện lỗi", value: errorRuns + n(mcp.errors), unit: "count", hint: "Lượt chạy cấu hình lỗi và lượt gọi MCP lỗi." },
    { key: "config_errors", label: "Cấu hình lỗi", value: errs("metrics_pull") + errs("auto_pause") + errs("budget_schedule") + errs("post_trigger"), unit: "count" },
    { key: "campaigns", label: "Chiến dịch mới", value: n(ap.total), unit: "count" },
  ];

  const blocks: ReportBlock[] = [
    {
      key: "config_health",
      title: "Sức khoẻ cấu hình",
      href: "configs",
      hrefLabel: "Tất cả cấu hình",
      empty: "Chưa có cấu hình tự động nào. Tạo job kéo chỉ số, Ads Autopilot hoặc lịch ngân sách để hệ thống bắt đầu chạy thay bạn.",
      metrics: [
        { key: "total", label: "Tổng cấu hình", value: configsByType.reduce((a, r) => a + n(r.total), 0) },
        { key: "on", label: "Đang bật", value: configsByType.reduce((a, r) => a + n(r.on), 0) },
        { key: "err", label: "Đang lỗi", value: configsByType.reduce((a, r) => a + n(r.err), 0) },
        { key: "runs", label: "Lượt chạy", value: totalRuns },
      ],
      table: configsByType.length
        ? {
            columns: ["Loại", "Tổng", "Đang bật", "Lỗi", "Lượt chạy"],
            rows: configsByType.map((r) => [r.type, n(r.total), n(r.on), n(r.err), n(run.get(r.type)?.runs)]),
          }
        : undefined,
    },
    {
      key: "connections",
      title: "Sức khoẻ kết nối",
      href: "connections",
      hrefLabel: "Kết nối",
      empty: "Chưa có kết nối nào.",
      metrics: [
        { key: "ok", label: "Đang khoẻ", value: n(conn.get("ok")) },
        { key: "expiring", label: "Sắp hết hạn", value: n(conn.get("expiring")) },
        { key: "dead", label: "Đã chết", value: n(conn.get("dead")) },
        { key: "disabled", label: "Đã tắt", value: n(conn.get("disabled")) },
      ],
    },
    {
      key: "post_triggers",
      title: "Tự động chạy ads",
      description: "Bài viết mới khớp từ khoá được AI soát chính sách rồi tự tạo chiến dịch.",
      href: "configs?filter=auto-run",
      hrefLabel: "Xem cấu hình",
      empty: "Chưa bật tự động chạy ads.",
      metrics: [
        { key: "triggers", label: "Cấu hình", value: n(triggers[0]?.total) },
        { key: "active", label: "Đang bật", value: n(triggers[0]?.on) },
        { key: "ap", label: "Chiến dịch tự tạo", value: n(ap.total) },
      ],
    },
    {
      key: "mcp",
      title: "AI dùng MCP",
      href: "mcp-keys",
      hrefLabel: "Quản lý key",
      empty: "Chưa có lượt gọi MCP nào trong kỳ.",
      metrics: [
        { key: "calls", label: "Lượt gọi", value: n(mcp.calls) },
        { key: "errors", label: "Lượt lỗi", value: n(mcp.errors) },
        { key: "avg", label: "TB phản hồi", value: n(mcp.avgMs), unit: "ms" },
        { key: "keys", label: "Key hoạt động", value: activeKeys },
      ],
      table: mcpTopTools.length
        ? { columns: ["Công cụ", "Lượt"], rows: mcpTopTools.map((r) => [r.tool, n(r.calls)]) }
        : undefined,
    },
    {
      key: "ai",
      title: "Token AI & chi phí",
      description: "Token của những lần hệ thống tự gọi AI bằng API key của bạn.",
      empty: "Chưa có lượt gọi AI nào trong kỳ.",
      metrics: [
        { key: "calls", label: "Lượt gọi", value: n(ai.calls) },
        { key: "tin", label: "Token in", value: n(ai.tin) },
        { key: "tout", label: "Token out", value: n(ai.tout) },
        { key: "cost", label: "Chi phí", value: n(ai.usd) / 1_000_000, unit: "currency" },
      ],
      table: aiByModel.length
        ? {
            columns: ["Model", "Lượt", "Token in", "Token out"],
            rows: aiByModel.map((r) => [r.model ?? "—", n(r.calls), n(r.tin), n(r.tout)]),
          }
        : undefined,
    },
    {
      key: "autopilot",
      title: "Ads Autopilot & Ngưỡng CPA",
      href: "cpa",
      hrefLabel: "Ngưỡng CPA",
      empty: "Chưa có bộ ngưỡng CPA nào.",
      metrics: [
        { key: "actions", label: "Autopilot đã chạy", value: n(ap.total) },
        { key: "paused", label: "Đã tắt quảng cáo", value: n(ap.paused) },
        { key: "kept", label: "AI giữ lại", value: n(ap.kept) },
        { key: "cpa", label: "Bộ ngưỡng CPA", value: cpaCount },
      ],
    },
    {
      key: "metrics_pull",
      title: "Kéo chỉ số",
      href: "configs?filter=metrics",
      hrefLabel: "Xem cấu hình",
      empty: "Chưa có job kéo chỉ số nào.",
      metrics: [
        { key: "jobs", label: "Tổng job", value: n(cfg.get("metrics_pull")?.total) },
        { key: "on", label: "Đang bật", value: n(cfg.get("metrics_pull")?.on) },
        { key: "err", label: "Đang lỗi", value: n(cfg.get("metrics_pull")?.err) },
        { key: "runs", label: "Lượt chạy", value: n(run.get("metrics_pull")?.runs) },
      ],
    },
    {
      key: "budget",
      title: "Tăng giảm ngân sách",
      href: "configs?filter=budget",
      hrefLabel: "Xem lịch",
      empty: "Chưa có lịch ngân sách nào.",
      metrics: [
        { key: "total", label: "Tổng lịch", value: n(cfg.get("budget_schedule")?.total) },
        { key: "on", label: "Đang bật", value: n(cfg.get("budget_schedule")?.on) },
        { key: "err", label: "Đang lỗi", value: n(cfg.get("budget_schedule")?.err) },
        { key: "runs", label: "Lượt áp", value: n(run.get("budget_schedule")?.runs) },
      ],
    },
    {
      key: "quick_ads",
      title: "Đăng quảng cáo nhanh & Mẫu quảng cáo",
      href: "quick-ads/templates",
      hrefLabel: "Mẫu quảng cáo",
      empty: "Chưa có mẫu quảng cáo nào.",
      metrics: [
        { key: "templates", label: "Tổng mẫu", value: templates },
        { key: "draft", label: "Bài nháp", value: n(postMap.get("draft")) },
        { key: "scheduled", label: "Đã lên lịch", value: n(postMap.get("scheduled")) },
        { key: "published", label: "Đã đăng", value: n(postMap.get("published")) },
      ],
    },
    {
      key: "social",
      title: "Bình luận & bài đăng",
      href: "comments",
      hrefLabel: "Bình luận",
      empty: "Chưa có bình luận nào trong kỳ.",
      metrics: [
        { key: "comments", label: "Bình luận", value: commentsCount },
        { key: "failed", label: "Đăng lỗi", value: n(postMap.get("failed")) },
      ],
    },
    {
      key: "members",
      title: "Thành viên & lời mời",
      href: "../settings/members",
      hrefLabel: "Thành viên",
      metrics: [
        { key: "members", label: "Tổng thành viên", value: membersCount },
        { key: "invites", label: "Lời mời đang chờ", value: invitesPending },
      ],
    },
    {
      key: "billing",
      title: "Gói cước & thanh toán",
      href: "../settings/billing",
      hrefLabel: "Gói cước & thanh toán",
      metrics: [
        { key: "tier", label: "Gói hiện tại", value: 0, text: plan[0]?.tier ?? "—" },
        { key: "tkqc", label: "Hạn mức TKQC", value: n(plan[0]?.quota?.tkqc) },
        { key: "qlbh", label: "Hạn mức QLBH", value: n(plan[0]?.quota?.qlbh) },
        { key: "staff", label: "Hạn mức staff", value: n(plan[0]?.quota?.staff) },
      ],
      table: invoices.length
        ? {
            columns: ["Mã", "Số tiền", "Trạng thái"],
            rows: invoices.map((i) => [i.id.slice(0, 8), i.amount, i.status]),
          }
        : undefined,
    },
    {
      key: "activity",
      title: "Nhật ký thao tác",
      href: "activity",
      hrefLabel: "Nhật ký",
      metrics: [{ key: "n", label: "Thao tác được ghi", value: activityCount }],
    },
  ];

  return {
    range: { preset: range.preset, label: range.label, from: range.from.toISOString(), to: range.to.toISOString() },
    headline,
    blocks,
  };
}

export type LlmUsageReport = {
  range: { preset: string; label: string; from: string; to: string };
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number };
  byModel: { model: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  series: { bucket: string; calls: number; inputTokens: number; outputTokens: number }[];
};

export async function getLlmUsage(bizId: string, range: ReportRange): Promise<LlmUsageReport> {
  const [totals, byModel, series] = await Promise.all([
    db
      .select({
        calls: sql<number>`count(*)::int`,
        tin: sql<number>`coalesce(sum(${schema.aiUsages.tokensIn}),0)::int`,
        tout: sql<number>`coalesce(sum(${schema.aiUsages.tokensOut}),0)::int`,
        usd: sql<number>`coalesce(sum(${schema.aiUsages.costUsd}),0)::bigint`,
      })
      .from(schema.aiUsages)
      .where(and(eq(schema.aiUsages.bizId, bizId), gte(schema.aiUsages.createdAt, range.from), lte(schema.aiUsages.createdAt, range.to))),
    db
      .select({
        model: schema.aiUsages.model,
        calls: sql<number>`count(*)::int`,
        tin: sql<number>`coalesce(sum(${schema.aiUsages.tokensIn}),0)::int`,
        tout: sql<number>`coalesce(sum(${schema.aiUsages.tokensOut}),0)::int`,
        usd: sql<number>`coalesce(sum(${schema.aiUsages.costUsd}),0)::bigint`,
      })
      .from(schema.aiUsages)
      .where(and(eq(schema.aiUsages.bizId, bizId), gte(schema.aiUsages.createdAt, range.from), lte(schema.aiUsages.createdAt, range.to)))
      .groupBy(schema.aiUsages.model),
    db
      .select({
        bucket: sql<string>`to_char(date_trunc('day', ${schema.aiUsages.createdAt}), 'YYYY-MM-DD')`,
        calls: sql<number>`count(*)::int`,
        tin: sql<number>`coalesce(sum(${schema.aiUsages.tokensIn}),0)::int`,
        tout: sql<number>`coalesce(sum(${schema.aiUsages.tokensOut}),0)::int`,
      })
      .from(schema.aiUsages)
      .where(and(eq(schema.aiUsages.bizId, bizId), gte(schema.aiUsages.createdAt, range.from), lte(schema.aiUsages.createdAt, range.to)))
      .groupBy(sql`date_trunc('day', ${schema.aiUsages.createdAt})`)
      .orderBy(sql`date_trunc('day', ${schema.aiUsages.createdAt})`),
  ]);

  const t = totals[0] ?? { calls: 0, tin: 0, tout: 0, usd: 0 };
  return {
    range: { preset: range.preset, label: range.label, from: range.from.toISOString(), to: range.to.toISOString() },
    totals: { calls: n(t.calls), inputTokens: n(t.tin), outputTokens: n(t.tout), costUsd: n(t.usd) / 1_000_000 },
    byModel: byModel.map((r) => ({
      model: r.model ?? "—",
      calls: n(r.calls),
      inputTokens: n(r.tin),
      outputTokens: n(r.tout),
      costUsd: n(r.usd) / 1_000_000,
    })),
    series: series.map((r) => ({ bucket: r.bucket, calls: n(r.calls), inputTokens: n(r.tin), outputTokens: n(r.tout) })),
  };
}

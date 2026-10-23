// Báo cáo dạng "group" — bám đúng shape API thật của app.done.vn.
// Nguồn: captures/full-2026-10-20/CONTRACTS-RE.md §2.
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReportRange } from "./reports";

export type Unit = "count" | "currency" | "percent" | "ms" | "text";
export type Trend = "neutral" | "up_good" | "up_bad" | "down_good" | "down_bad";

export type Metric = {
  key: string;
  label: string;
  value: number;
  text: string | null;
  prev: number | null;
  unit: Unit;
  trend: Trend;
  hint: string | null;
  /** true nếu tăng là xấu (lỗi, chi phí…) — dùng để tính lại trend. */
  bad: boolean;
};

export type Series = { key: string; label: string; tone: string; points: number[] };

export type GroupTable = {
  key: string;
  title: string;
  columns: { label: string; kind: "text" | "mono" | "number" | "datetime" | "status" | "vnd" }[];
  rows: (string | number | null)[][];
  empty: string;
};

export type ReportGroup = {
  key: string;
  title: string;
  description: string;
  href: string;
  href_label: string;
  metrics: Metric[];
  snapshot: Metric[];
  series: Series[];
  tables: GroupTable[];
  note: string | null;
};

export type BizGroupsReport = {
  preset: string;
  label: string;
  from_at: string;
  to_at: string;
  prev_from_at: string;
  prev_to_at: string;
  timezone: string;
  bucket: "hour" | "day" | "month";
  buckets: string[];
  headline: Metric[];
  groups: ReportGroup[];
  elapsed_ms: number;
};

const TZ = "Asia/Ho_Chi_Minh";
const n = (v: unknown) => Number(v ?? 0);
const iso = (d: Date) => d.toISOString();

function computeTrend(value: number, prev: number | null, bad: boolean): Trend {
  if (prev === null || !Number.isFinite(prev)) return "neutral";
  if (value > prev) return bad ? "up_bad" : "up_good";
  if (value < prev) return bad ? "down_good" : "down_bad";
  return "neutral";
}

function metric(
  key: string,
  label: string,
  value: number,
  opts: { prev?: number | null; unit?: Unit; text?: string | null; hint?: string | null; bad?: boolean } = {},
): Metric {
  const prev = opts.prev ?? null;
  const unit = opts.unit ?? "count";
  const bad = Boolean(opts.bad);
  return {
    key,
    label,
    value,
    text: opts.text ?? null,
    prev,
    unit,
    trend: unit === "text" ? "neutral" : computeTrend(value, prev, bad),
    hint: opts.hint ?? null,
    bad,
  };
}

function bucketPlan(range: ReportRange): { bucket: "hour" | "day" | "month"; buckets: string[] } {
  const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000));
  if (days <= 1) {
    const buckets: string[] = [];
    for (let i = 0; i < 24; i++) {
      const d = new Date(range.from);
      d.setHours(i, 0, 0, 0);
      buckets.push(d.toISOString());
    }
    return { bucket: "hour", buckets };
  }
  if (days > 62) {
    const buckets: string[] = [];
    const d = new Date(range.from.getFullYear(), range.from.getMonth(), 1);
    while (d <= range.to) {
      buckets.push(d.toISOString());
      d.setMonth(d.getMonth() + 1);
    }
    return { bucket: "month", buckets };
  }
  const buckets: string[] = [];
  const d = new Date(range.from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(range.to);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    buckets.push(d.toISOString());
    d.setDate(d.getDate() + 1);
  }
  return { bucket: "day", buckets };
}

function bucketOf(date: Date, range: ReportRange, bucket: "hour" | "day" | "month"): number {
  if (bucket === "hour") return Math.max(0, Math.floor((date.getTime() - new Date(range.from).setHours(0, 0, 0, 0)) / 3_600_000));
  if (bucket === "month") {
    return (date.getFullYear() - range.from.getFullYear()) * 12 + (date.getMonth() - range.from.getMonth());
  }
  return Math.max(0, Math.floor((date.getTime() - new Date(range.from).setHours(0, 0, 0, 0)) / 86_400_000));
}

function pointsOf(rows: { at: Date }[], range: ReportRange, bucket: "hour" | "day" | "month", size: number): number[] {
  const pts = new Array(size).fill(0);
  for (const r of rows) {
    const i = bucketOf(r.at, range, bucket);
    if (i >= 0 && i < size) pts[i] += 1;
  }
  return pts;
}

function inRange(col: any, range: ReportRange) {
  return and(gte(col, range.from), lte(col, range.to));
}

// ---------------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------------

export type OverviewV2 = {
  range_days: number;
  from_at: string;
  to_at: string;
  preset: string;
  prev_from_at: string;
  prev_to_at: string;
  timezone: string;
  summary: {
    configs_total: number;
    configs_active: number;
    configs_failing: number;
    campaigns_created: number;
    policy_blocked: number;
    runs_ok: number;
    runs_failed: number;
  };
  config_health: { total: number; active: number; ok: number; failed: number; never_run: number; items: unknown[] };
  post_trigger: Record<string, number | unknown[]>;
  connections: { total: number; healthy: number; warning: number; dead: number; unchecked: number; inactive: number; attention: unknown[] };
  mcp: { calls: number; errors: number; error_rate: number; avg_duration_ms: number; active_keys: number; top_tools: { tool_name: string; calls: number; errors: number }[] };
  quota: {
    tkqc: { current: number; quota: number };
    qlbh: { current: number; quota: number };
    staff: { current: number; quota: number };
    frequency_minutes: number;
    sub_status: string;
    days_remaining: number | null;
  };
};

export async function getOverviewV2(bizId: string, range: ReportRange): Promise<OverviewV2> {
  const days = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000));

  const [configs, conns, mcpAgg, mcpTools, keys, plan, staffCount, runsAgg, triggers, campaigns] = await Promise.all([
    db.select().from(schema.configs).where(eq(schema.configs.bizId, bizId)),
    db.select().from(schema.connections).where(eq(schema.connections.bizId, bizId)),
    db
      .select({
        calls: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where not ${schema.mcpCallLogs.ok})::int`,
        avgMs: sql<number>`coalesce(avg(${schema.mcpCallLogs.latencyMs}),0)::int`,
      })
      .from(schema.mcpCallLogs)
      .innerJoin(schema.mcpKeys, eq(schema.mcpCallLogs.keyId, schema.mcpKeys.id))
      .where(and(eq(schema.mcpKeys.bizId, bizId), inRange(schema.mcpCallLogs.createdAt, range))),
    db
      .select({
        tool: schema.mcpCallLogs.tool,
        calls: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where not ${schema.mcpCallLogs.ok})::int`,
      })
      .from(schema.mcpCallLogs)
      .innerJoin(schema.mcpKeys, eq(schema.mcpCallLogs.keyId, schema.mcpKeys.id))
      .where(and(eq(schema.mcpKeys.bizId, bizId), inRange(schema.mcpCallLogs.createdAt, range)))
      .groupBy(schema.mcpCallLogs.tool)
      .orderBy(sql`count(*) desc`)
      .limit(5),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.mcpKeys)
      .where(and(eq(schema.mcpKeys.bizId, bizId), eq(schema.mcpKeys.status, "active"))),
    db.select().from(schema.plans).where(eq(schema.plans.bizId, bizId)).limit(1),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.members).where(eq(schema.members.bizId, bizId)),
    db
      .select({
        ok: sql<number>`count(*) filter (where ${schema.configRuns.status}='ok')::int`,
        failed: sql<number>`count(*) filter (where ${schema.configRuns.status}='error')::int`,
      })
      .from(schema.configRuns)
      .innerJoin(schema.configs, eq(schema.configRuns.configId, schema.configs.id))
      .where(and(eq(schema.configs.bizId, bizId), inRange(schema.configRuns.startedAt, range))),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${schema.configs.status}='on')::int`,
      })
      .from(schema.configs)
      .where(and(eq(schema.configs.bizId, bizId), eq(schema.configs.type, "post_trigger"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.scheduledPosts)
      .where(and(eq(schema.scheduledPosts.bizId, bizId), inRange(schema.scheduledPosts.createdAt, range))),
  ]);

  const health = (h: string) => conns.filter((c) => c.health === h).length;
  const mcp = mcpAgg[0] ?? { calls: 0, errors: 0, avgMs: 0 };
  const p = plan[0];
  const daysRemaining = p?.expiresAt ? Math.max(0, Math.round((p.expiresAt.getTime() - Date.now()) / 86_400_000)) : null;

  return {
    range_days: days,
    from_at: iso(range.from),
    to_at: iso(range.to),
    preset: range.preset,
    prev_from_at: iso(range.prevFrom),
    prev_to_at: iso(range.prevTo),
    timezone: TZ,
    summary: {
      configs_total: configs.length,
      configs_active: configs.filter((c) => c.status === "on").length,
      configs_failing: configs.filter((c) => c.status === "error").length,
      campaigns_created: n(campaigns[0]?.n),
      policy_blocked: 0,
      runs_ok: n(runsAgg[0]?.ok),
      runs_failed: n(runsAgg[0]?.failed),
    },
    config_health: {
      total: configs.length,
      active: configs.filter((c) => c.status === "on").length,
      ok: configs.filter((c) => c.lastRunStatus === "ok").length,
      failed: configs.filter((c) => c.lastRunStatus === "error" || c.status === "error").length,
      never_run: configs.filter((c) => !c.lastRunAt).length,
      items: [],
    },
    post_trigger: {
      triggers_total: n(triggers[0]?.total),
      triggers_active: n(triggers[0]?.active),
      logs_total: 0,
      campaigns_created: n(campaigns[0]?.n),
      policy_pass: 0,
      policy_violation: 0,
      policy_error: 0,
      status_success: 0,
      status_failed: 0,
      status_skipped: 0,
      recent_violations: [],
    },
    connections: {
      total: conns.length,
      healthy: health("ok"),
      warning: health("expiring"),
      dead: health("dead"),
      unchecked: health("unchecked"),
      inactive: health("disabled"),
      attention: [],
    },
    mcp: {
      calls: n(mcp.calls),
      errors: n(mcp.errors),
      error_rate: n(mcp.calls) ? (n(mcp.errors) / n(mcp.calls)) * 100 : 0,
      avg_duration_ms: n(mcp.avgMs),
      active_keys: n(keys[0]?.n),
      top_tools: mcpTools.map((t) => ({ tool_name: t.tool, calls: n(t.calls), errors: n(t.errors) })),
    },
    quota: {
      tkqc: { current: conns.filter((c) => ["meta_ads", "tiktok_ads", "google_ads", "openai_ads"].includes(c.provider)).length, quota: p?.quota?.tkqc ?? 3 },
      qlbh: { current: conns.filter((c) => c.provider.startsWith("pancake") || ["nhanhvn", "sapo", "shopify", "woocommerce"].includes(c.provider)).length, quota: p?.quota?.qlbh ?? 1 },
      staff: { current: n(staffCount[0]?.n), quota: p?.quota?.staff ?? 1 },
      frequency_minutes: p?.quota?.minSyncMinutes ?? 30,
      sub_status: p?.status ?? "active",
      days_remaining: daysRemaining,
    },
  };
}

// ---------------------------------------------------------------------------
// BIZ (groups)
// ---------------------------------------------------------------------------

async function computeBizGroups(bizId: string, range: ReportRange): Promise<BizGroupsReport> {
  const t0 = Date.now();
  const { bucket, buckets } = bucketPlan(range);
  const size = buckets.length;

  const [
    configs,
    runs,
    apActions,
    conns,
    mcpLogs,
    keys,
    skillsCount,
    presetsCount,
    aiUsage,
    activities,
    triggers,
    templates,
    cpa,
    membersRows,
    invites,
    plan,
    invoices,
    threads,
    comments,
  ] = await Promise.all([
    db.select().from(schema.configs).where(eq(schema.configs.bizId, bizId)),
    db
      .select({
        type: schema.configs.type,
        name: schema.configs.name,
        status: schema.configRuns.status,
        error: schema.configRuns.error,
        startedAt: schema.configRuns.startedAt,
      })
      .from(schema.configRuns)
      .innerJoin(schema.configs, eq(schema.configRuns.configId, schema.configs.id))
      .where(and(eq(schema.configs.bizId, bizId), inRange(schema.configRuns.startedAt, range))),
    db
      .select()
      .from(schema.autopilotActions)
      .innerJoin(schema.configs, eq(schema.autopilotActions.configId, schema.configs.id))
      .where(and(eq(schema.configs.bizId, bizId), inRange(schema.autopilotActions.createdAt, range))),
    db.select().from(schema.connections).where(eq(schema.connections.bizId, bizId)),
    db
      .select({
        tool: schema.mcpCallLogs.tool,
        ok: schema.mcpCallLogs.ok,
        latencyMs: schema.mcpCallLogs.latencyMs,
        keyId: schema.mcpCallLogs.keyId,
        createdAt: schema.mcpCallLogs.createdAt,
      })
      .from(schema.mcpCallLogs)
      .innerJoin(schema.mcpKeys, eq(schema.mcpCallLogs.keyId, schema.mcpKeys.id))
      .where(and(eq(schema.mcpKeys.bizId, bizId), inRange(schema.mcpCallLogs.createdAt, range))),
    db.select().from(schema.mcpKeys).where(eq(schema.mcpKeys.bizId, bizId)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.skills).where(eq(schema.skills.bizId, bizId)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.fieldPresets).where(eq(schema.fieldPresets.bizId, bizId)),
    db
      .select()
      .from(schema.aiUsages)
      .where(and(eq(schema.aiUsages.bizId, bizId), inRange(schema.aiUsages.createdAt, range))),
    db
      .select({
        action: schema.activityLogs.action,
        actorId: schema.activityLogs.actorId,
        status: schema.activityLogs.status,
        createdAt: schema.activityLogs.createdAt,
      })
      .from(schema.activityLogs)
      .where(and(eq(schema.activityLogs.bizId, bizId), inRange(schema.activityLogs.createdAt, range))),
    db
      .select()
      .from(schema.configs)
      .where(and(eq(schema.configs.bizId, bizId), eq(schema.configs.type, "post_trigger"))),
    db.select().from(schema.adTemplates).where(eq(schema.adTemplates.bizId, bizId)),
    db.select().from(schema.cpaThresholds).where(eq(schema.cpaThresholds.bizId, bizId)),
    db
      .select({
        id: schema.members.id,
        role: schema.members.role,
        createdAt: schema.members.createdAt,
        name: schema.users.name,
        email: schema.users.email,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
      .where(eq(schema.members.bizId, bizId)),
    db.select().from(schema.invites).where(eq(schema.invites.bizId, bizId)),
    db.select().from(schema.plans).where(eq(schema.plans.bizId, bizId)).limit(1),
    db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.bizId, bizId), inRange(schema.invoices.createdAt, range))),
    db
      .select()
      .from(schema.supportThreads)
      .where(and(eq(schema.supportThreads.bizId, bizId), inRange(schema.supportThreads.createdAt, range))),
    db
      .select({ pageId: schema.commentEvents.pageId, createdAt: schema.commentEvents.createdAt })
      .from(schema.commentEvents)
      .where(and(eq(schema.commentEvents.bizId, bizId), inRange(schema.commentEvents.createdAt, range))),
  ]);

  const cfgOf = (type: string) => configs.filter((c) => c.type === type);
  const runsOf = (type: string) => runs.filter((r) => r.type === type);
  const aiCalls = aiUsage.length;
  const mcpCalls = mcpLogs.length;
  const mcpErrors = mcpLogs.filter((l) => !l.ok).length;
  const events = aiCalls + comments.length + mcpCalls + activities.length;
  const prevEvents = null;
  const errors = mcpErrors + runs.filter((r) => r.status === "error").length;

  // Series
  const series = (key: string, label: string, tone: string, rows: { at: Date }[]): Series => ({
    key,
    label,
    tone,
    points: pointsOf(rows, range, bucket, size),
  });

  const mcpTop = new Map<string, { calls: number; errors: number; ms: number }>();
  for (const l of mcpLogs) {
    const cur = mcpTop.get(l.tool) ?? { calls: 0, errors: 0, ms: 0 };
    cur.calls += 1;
    if (!l.ok) cur.errors += 1;
    cur.ms += n(l.latencyMs);
    mcpTop.set(l.tool, cur);
  }
  const topTools = [...mcpTop.entries()]
    .sort((a, b) => b[1].calls - a[1].calls)
    .slice(0, 10)
    .map(([tool, v]) => [tool, v.calls, v.errors, Math.round(v.ms / Math.max(1, v.calls))]);

  const mcpByKey = new Map<string, { calls: number; errors: number; last: Date }>();
  for (const l of mcpLogs) {
    const cur = mcpByKey.get(l.keyId) ?? { calls: 0, errors: 0, last: l.createdAt };
    cur.calls += 1;
    if (!l.ok) cur.errors += 1;
    if (l.createdAt > cur.last) cur.last = l.createdAt;
    mcpByKey.set(l.keyId, cur);
  }
  const keyName = new Map(keys.map((k) => [k.id, k.name ?? k.keyPrefix]));

  const pageCount = new Map<string, number>();
  for (const c of comments) pageCount.set(c.pageId, (pageCount.get(c.pageId) ?? 0) + 1);

  const invoicePaid = invoices.filter((i) => i.status === "paid");
  const sumVnd = (list: typeof invoices) => list.reduce((a, i) => a + n(i.amount), 0);

  const supportByKind = (kind: string) => threads.filter((t) => t.kind === kind).length;

  const actionCount = new Map<string, { count: number; last: Date }>();
  for (const a of activities) {
    const cur = actionCount.get(a.action) ?? { count: 0, last: a.createdAt };
    cur.count += 1;
    if (a.createdAt > cur.last) cur.last = a.createdAt;
    actionCount.set(a.action, cur);
  }

  const p = plan[0];
  const daysRemaining = p?.expiresAt ? Math.max(0, Math.round((p.expiresAt.getTime() - Date.now()) / 86_400_000)) : null;

  const groups: ReportGroup[] = [
    {
      key: "post_triggers",
      title: "Tự động chạy ads",
      description: "Bài viết mới khớp từ khoá được AI soát chính sách rồi tự tạo chiến dịch.",
      href: "dashboard/configs?filter=auto-run",
      href_label: "Xem cấu hình",
      metrics: [
        metric("logs", "Bài khớp từ khoá", comments.length),
        metric("campaigns", "Chiến dịch tự tạo", 0),
        metric("violations", "Bị chặn chính sách", 0, { bad: true }),
        metric("failed", "Lượt lỗi", runsOf("post_trigger").filter((r) => r.status === "error").length, { bad: true }),
        metric("skipped", "Bỏ qua", runsOf("post_trigger").filter((r) => r.status === "skipped").length),
        metric("policy_ai", "Lượt AI soát", aiUsage.filter((u) => u.purpose === "policy_check").length),
      ],
      snapshot: [
        metric("total", "Cấu hình", triggers.length),
        metric("active", "Đang bật", triggers.filter((c) => c.status === "on").length),
        metric("failing", "Đang lỗi", triggers.filter((c) => c.status === "error").length, { bad: true }),
        metric("whitelists", "Trang trong whitelist", 0),
      ],
      series: [
        series("logs", "Bài khớp", "primary", comments.map((c) => ({ at: c.createdAt }))),
        series("campaigns", "Chiến dịch", "green", []),
        series("violations", "Bị chặn", "amber", []),
        series("failed", "Lỗi", "red", []),
      ],
      tables: [
        {
          key: "by_page",
          title: "Theo trang",
          columns: [
            { label: "Trang", kind: "text" },
            { label: "Bài khớp", kind: "number" },
            { label: "Chiến dịch", kind: "number" },
            { label: "Bị chặn", kind: "number" },
            { label: "Lỗi", kind: "number" },
          ],
          rows: [...pageCount.entries()].map(([page, count]) => [page, count, 0, 0, 0]),
          empty: "Chưa có bài nào khớp từ khoá trong kỳ.",
        },
      ],
      note: null,
    },
    {
      key: "autopilot",
      title: "Ads Autopilot & Ngưỡng CPA",
      description: "Tự tắt quảng cáo vượt ngưỡng CPA, có AI phân tích trước khi tắt.",
      href: "dashboard/cpa",
      href_label: "Ngưỡng CPA",
      metrics: [
        metric("ran", "Lượt chạy", runsOf("auto_pause").length),
        metric("failed", "Lượt lỗi", runsOf("auto_pause").filter((r) => r.status === "error").length, { bad: true }),
        metric("paused", "Quảng cáo đã tắt", apActions.filter((r) => ["paused", "paused_whitelist"].includes(r.autopilot_actions.action)).length),
        metric("protected", "Được bảo vệ", apActions.filter((r) => r.autopilot_actions.action === "protected_skipped").length),
        metric("ai_calls", "Lượt gọi AI", aiUsage.filter((u) => u.purpose === "cpa_analysis").length),
        metric("ai_errors", "Lỗi AI", 0, { bad: true }),
        metric("ai_tokens", "Token AI", aiUsage.reduce((a, u) => a + n(u.tokensIn) + n(u.tokensOut), 0)),
        metric("cpa_updated", "Ngưỡng CPA cập nhật", 0),
      ],
      snapshot: [
        metric("total", "Cấu hình Autopilot", cfgOf("auto_pause").length),
        metric("active", "Đang bật", cfgOf("auto_pause").filter((c) => c.status === "on").length),
        metric("failing", "Đang lỗi", cfgOf("auto_pause").filter((c) => c.status === "error").length, { bad: true }),
        metric("cpa", "Bộ ngưỡng CPA", cpa.length),
      ],
      series: [
        series("calls", "Lượt chạy", "primary", apActions.map((r) => ({ at: r.autopilot_actions.createdAt }))),
        series("errors", "Lỗi", "red", []),
      ],
      tables: [
        {
          key: "cpa_platforms",
          title: "Theo nền tảng",
          columns: [
            { label: "Nền tảng", kind: "text" },
            { label: "Số bộ ngưỡng", kind: "number" },
          ],
          rows: [...new Set(cpa.map((c) => c.platform))].map((p2) => [p2, cpa.filter((c) => c.platform === p2).length]),
          empty: "Chưa có bộ ngưỡng CPA nào.",
        },
      ],
      note:
        "Số quảng cáo đã tắt lấy từ bảng autopilot_actions — mỗi lần tắt do CPA vượt ngưỡng hoặc do page ngoài whitelist đều được ghi lại.",
    },
    {
      key: "sync",
      title: "Kéo chỉ số",
      description: "Job kéo chỉ số Meta, TikTok, Google Ads về Google Sheets.",
      href: "dashboard/configs?filter=metrics",
      href_label: "Xem cấu hình",
      metrics: [
        metric("ran", "Lượt chạy", runsOf("metrics_pull").length),
        metric("failed", "Lượt lỗi", runsOf("metrics_pull").filter((r) => r.status === "error").length, { bad: true }),
        metric("created", "Job mới", cfgOf("metrics_pull").filter((c) => c.createdAt >= range.from).length),
        metric("ad_rows", "Dòng chỉ số đã ghi", 0),
      ],
      snapshot: [
        metric("total", "Tổng job", cfgOf("metrics_pull").length),
        metric("active", "Đang bật", cfgOf("metrics_pull").filter((c) => c.status === "on").length),
        metric("failing", "Đang lỗi", cfgOf("metrics_pull").filter((c) => c.status === "error").length, { bad: true }),
        metric("never", "Chưa chạy lần nào", cfgOf("metrics_pull").filter((c) => !c.lastRunAt).length),
        metric("backfill", "Đang backfill", 0),
        metric("sheets", "Sheet đã nối", conns.filter((c) => c.provider === "google_sheets").length),
      ],
      series: [],
      tables: [
        {
          key: "failing",
          title: "Job đang lỗi",
          columns: [
            { label: "Job", kind: "text" },
            { label: "Loại", kind: "text" },
            { label: "Chạy gần nhất", kind: "datetime" },
            { label: "Lỗi", kind: "mono" },
          ],
          rows: cfgOf("metrics_pull")
            .filter((c) => c.status === "error")
            .map((c) => [c.name, c.type, c.lastRunAt ? iso(c.lastRunAt) : null, c.lastError ?? ""]),
          empty: "Không có job nào đang lỗi.",
        },
      ],
      note: "Job chỉ lưu lượt chạy GẦN NHẤT, nên số lượt chạy theo kỳ là số job có lượt gần nhất rơi vào kỳ, không phải tổng số lượt.",
    },
    {
      key: "budget",
      title: "Tăng giảm ngân sách",
      description: "Lịch tự đổi ngân sách chiến dịch, nhóm quảng cáo theo khung giờ.",
      href: "dashboard/budget-schedule",
      href_label: "Xem lịch",
      metrics: [
        metric("applied", "Lượt áp ngân sách", runsOf("budget_schedule").filter((r) => r.status === "ok").length),
        metric("failed", "Lượt lỗi", runsOf("budget_schedule").filter((r) => r.status === "error").length, { bad: true }),
        metric("created", "Lịch mới", cfgOf("budget_schedule").filter((c) => c.createdAt >= range.from).length),
      ],
      snapshot: [
        metric("total", "Tổng lịch", cfgOf("budget_schedule").length),
        metric("active", "Đang bật", cfgOf("budget_schedule").filter((c) => c.status === "on").length),
        metric("failing", "Đang lỗi", cfgOf("budget_schedule").filter((c) => c.status === "error").length, { bad: true }),
        metric("retrying", "Đang thử lại", 0),
      ],
      series: [],
      tables: [
        {
          key: "failing",
          title: "Lịch đang lỗi",
          columns: [
            { label: "Đối tượng", kind: "text" },
            { label: "Áp gần nhất", kind: "datetime" },
            { label: "Lỗi liên tiếp", kind: "number" },
            { label: "Lỗi", kind: "mono" },
          ],
          rows: cfgOf("budget_schedule")
            .filter((c) => c.status === "error")
            .map((c) => [c.name, c.lastRunAt ? iso(c.lastRunAt) : null, 0, c.lastError ?? ""]),
          empty: "Không có lịch nào đang lỗi.",
        },
      ],
      note: "Lịch ngân sách chỉ lưu lượt áp GẦN NHẤT của mỗi cấu hình.",
    },
    {
      key: "templates",
      title: "Đăng quảng cáo nhanh & Mẫu quảng cáo",
      description: "Mẫu cấu hình dùng lại khi đăng quảng cáo nhanh và tự động chạy ads.",
      href: "dashboard/quick-ads/templates",
      href_label: "Mẫu quảng cáo",
      metrics: [
        metric("created", "Mẫu mới", templates.filter((t) => t.createdAt >= range.from).length),
        metric("updated", "Mẫu cập nhật", 0),
      ],
      snapshot: [metric("total", "Tổng mẫu", templates.length)],
      series: [],
      tables: [
        {
          key: "by_objective",
          title: "Theo mục tiêu",
          columns: [
            { label: "Mục tiêu", kind: "text" },
            { label: "Số mẫu", kind: "number" },
          ],
          rows: [...new Set(templates.map((t) => t.objective))].map((o) => [o, templates.filter((t) => t.objective === o).length]),
          empty: "Chưa có mẫu quảng cáo nào.",
        },
      ],
      note:
        "Chiến dịch tạo ở trang Đăng quảng cáo nhanh đi thẳng lên nền tảng, hệ thống chưa lưu lịch sử nên chưa đếm được theo kỳ. Chiến dịch tạo qua AI (MCP) nằm ở nhóm MCP.",
    },
    {
      key: "connections",
      title: "Kết nối & tài khoản quảng cáo",
      description: "Tài khoản quảng cáo, kênh bán hàng, Google Sheets, khoá AI và bot thông báo.",
      href: "dashboard/connections",
      href_label: "Kết nối",
      metrics: [
        metric("created", "Kết nối mới", conns.filter((c) => c.createdAt >= range.from).length),
        metric("ad_accounts", "Tài khoản quảng cáo", conns.reduce((a, c) => a + (((c.meta as any).adAccounts as unknown[])?.length ?? 0), 0)),
        metric("alerts", "Cảnh báo", conns.filter((c) => c.health !== "ok").length, { bad: true }),
        metric("tests", "Lượt kiểm tra", 0),
        metric("checked", "Đã kiểm tra trong kỳ", conns.filter((c) => c.lastCheckedAt && c.lastCheckedAt >= range.from).length),
        metric("errored", "Lỗi kết nối", conns.filter((c) => c.health === "dead").length, { bad: true }),
      ],
      snapshot: [
        metric("total", "Tổng kết nối", conns.length),
        metric("healthy", "Đang khoẻ", conns.filter((c) => c.health === "ok").length),
        metric("warning", "Sắp hết hạn", conns.filter((c) => c.health === "expiring").length),
        metric("dead", "Đã chết", conns.filter((c) => c.health === "dead").length),
        metric("inactive", "Đã tắt", conns.filter((c) => c.health === "disabled").length),
        metric("ad_accounts", "TK quảng cáo", conns.reduce((a, c) => a + (((c.meta as any).adAccounts as unknown[])?.length ?? 0), 0)),
        metric("sales", "Kênh bán hàng", conns.filter((c) => c.provider.startsWith("pancake") || ["nhanhvn", "sapo", "shopify"].includes(c.provider)).length),
        metric("ai", "Khoá AI", conns.filter((c) => ["openai", "gemini", "anthropic", "deepseek", "openai_compatible"].includes(c.provider)).length),
        metric("integrations", "Tích hợp khác", conns.filter((c) => c.provider === "google_sheets" || c.provider === "webhook").length),
      ],
      series: [],
      tables: [
        {
          key: "by_type",
          title: "Theo loại",
          columns: [
            { label: "Loại", kind: "text" },
            { label: "Tổng", kind: "number" },
            { label: "Đang bật", kind: "number" },
            { label: "Khoẻ", kind: "number" },
            { label: "Cần xử lý", kind: "number" },
          ],
          rows: [...new Set(conns.map((c) => c.provider))].map((prov) => {
            const list = conns.filter((c) => c.provider === prov);
            return [
              prov,
              list.length,
              list.filter((c) => c.health !== "disabled").length,
              list.filter((c) => c.health === "ok").length,
              list.filter((c) => c.health !== "ok" && c.health !== "disabled").length,
            ];
          }),
          empty: "Chưa có kết nối nào.",
        },
      ],
      note: null,
    },
    {
      key: "mcp",
      title: "API key MCP & AI gọi công cụ",
      description: "Trợ lý AI (Claude, ChatGPT, n8n...) đọc và thao tác dữ liệu qua MCP key của Biz.",
      href: "dashboard/mcp-keys",
      href_label: "API key MCP",
      metrics: [
        metric("calls", "Lượt gọi công cụ", mcpCalls),
        metric("errors", "Lượt lỗi", mcpErrors, { bad: true }),
        metric("writes", "Thao tác ghi (tạo, sửa, bật/tắt)", 0),
        metric("creates", "Lượt tạo mới qua AI", 0, { hint: "Chiến dịch, nhóm quảng cáo, quảng cáo... được AI tạo qua MCP." }),
        metric("avg_ms", "Phản hồi trung bình", Math.round(mcpLogs.reduce((a, l) => a + n(l.latencyMs), 0) / Math.max(1, mcpCalls)), { unit: "ms", bad: true }),
        metric("tools", "Số công cụ khác nhau", mcpTop.size),
        metric("keys_created", "Key mới tạo", keys.filter((k) => k.createdAt >= range.from).length),
        metric("keys_revoked", "Key bị thu hồi", keys.filter((k) => k.status === "revoked").length),
        metric("skills_created", "Skill mới tạo", n(skillsCount[0]?.n)),
      ],
      snapshot: [
        metric("keys_active", "Key đang hoạt động", keys.filter((k) => k.status === "active").length),
        metric("keys_paused", "Key tạm dừng", keys.filter((k) => k.status === "paused").length),
        metric("keys_revoked", "Key đã thu hồi", keys.filter((k) => k.status === "revoked").length),
        metric("keys_expired", "Key hết hạn", keys.filter((k) => k.expiresAt && k.expiresAt < new Date()).length),
        metric("skills", "Skill riêng của Biz", n(skillsCount[0]?.n)),
        metric("presets", "Bộ chỉ số riêng", n(presetsCount[0]?.n)),
      ],
      series: [
        series("calls", "Lượt gọi", "primary", mcpLogs.map((l) => ({ at: l.createdAt }))),
        series("errors", "Lỗi", "red", mcpLogs.filter((l) => !l.ok).map((l) => ({ at: l.createdAt }))),
      ],
      tables: [
        {
          key: "top_tools",
          title: "Công cụ dùng nhiều nhất",
          columns: [
            { label: "Công cụ", kind: "mono" },
            { label: "Lượt", kind: "number" },
            { label: "Lỗi", kind: "number" },
            { label: "TB (ms)", kind: "number" },
          ],
          rows: topTools,
          empty: "Chưa có lượt gọi công cụ nào trong kỳ.",
        },
        {
          key: "by_key",
          title: "Theo key",
          columns: [
            { label: "Key", kind: "text" },
            { label: "Lượt", kind: "number" },
            { label: "Lỗi", kind: "number" },
            { label: "Gọi gần nhất", kind: "datetime" },
          ],
          rows: [...mcpByKey.entries()].map(([keyId, v]) => [keyName.get(keyId) ?? keyId, v.calls, v.errors, iso(v.last)]),
          empty: "Chưa có key nào được dùng trong kỳ.",
        },
      ],
      note: null,
    },
    {
      key: "team",
      title: "Thành viên & lời mời",
      description: "Ai đang ở trong Biz, ai mới được mời, ai vừa tham gia.",
      href: "settings/members",
      href_label: "Thành viên",
      metrics: [
        metric("joined", "Thành viên mới", membersRows.filter((m) => m.createdAt >= range.from).length),
        metric("sent", "Lời mời đã gửi", invites.filter((i) => i.createdAt >= range.from).length),
        metric("accepted", "Lời mời được nhận", invites.filter((i) => i.status === "accepted").length),
        metric("revoked", "Lời mời bị thu hồi", invites.filter((i) => i.status === "revoked").length),
      ],
      snapshot: [
        metric("members", "Tổng thành viên", membersRows.length),
        metric("role_owner", "Chủ Biz", membersRows.filter((m) => m.role === "owner").length),
        metric("pending", "Lời mời chờ", invites.filter((i) => i.status === "pending").length),
      ],
      series: [],
      tables: [
        {
          key: "members",
          title: "Thành viên",
          columns: [
            { label: "Tên", kind: "text" },
            { label: "Email", kind: "text" },
            { label: "Vai trò", kind: "text" },
            { label: "Tham gia", kind: "datetime" },
            { label: "Đăng nhập gần nhất", kind: "datetime" },
          ],
          rows: membersRows.map((m) => [m.name ?? "—", m.email, m.role, iso(m.createdAt), null]),
          empty: "Chưa có thành viên.",
        },
      ],
      note: null,
    },
    {
      key: "billing",
      title: "Gói cước & thanh toán",
      description: "Hoá đơn, thanh toán, mã giảm giá, hoàn tiền và email về gói.",
      href: "settings/billing",
      href_label: "Gói cước & thanh toán",
      metrics: [
        metric("paid_amount", "Đã thanh toán", sumVnd(invoicePaid), { unit: "currency" }),
        metric("paid", "Hoá đơn đã trả", invoicePaid.length),
        metric("created", "Hoá đơn mới", invoices.length),
        metric("cancelled", "Đã huỷ", invoices.filter((i) => i.status === "cancelled").length),
        metric("coupons", "Mã giảm giá dùng", 0),
        metric("discount", "Tiền giảm", 0, { unit: "currency" }),
        metric("refunds", "Lượt hoàn tiền", 0),
        metric("refund_amount", "Tiền hoàn", 0, { unit: "currency" }),
        metric("inquiries", "Yêu cầu về gói", 0),
        metric("emails", "Email đã gửi", 0),
      ],
      snapshot: [
        metric("sub_status", "Gói hiện tại", 0, { unit: "text", text: p?.tier ?? "—" }),
        metric("pending", "Hoá đơn chờ thanh toán", invoices.filter((i) => i.status === "pending").length),
        metric("end_date", "Ngày hết hạn", 0, { unit: "text", text: p?.expiresAt ? p.expiresAt.toLocaleDateString("vi-VN") : "—" }),
      ],
      series: [],
      tables: [
        {
          key: "invoices",
          title: "Hoá đơn",
          columns: [
            { label: "Mã", kind: "mono" },
            { label: "Loại", kind: "text" },
            { label: "Số tiền", kind: "vnd" },
            { label: "Trạng thái", kind: "status" },
            { label: "Tạo lúc", kind: "datetime" },
            { label: "Thanh toán lúc", kind: "datetime" },
          ],
          rows: invoices.map((i) => [i.id.slice(0, 8), (i.detail as any)?.kind ?? "invoice", n(i.amount), i.status, iso(i.createdAt), null]),
          empty: "Không có hoá đơn nào trong kỳ.",
        },
      ],
      note: null,
    },
    {
      key: "support",
      title: "Phản hồi & hỗ trợ",
      description: "Báo lỗi, góp ý và câu hỏi của cả Biz gửi cho đội hỗ trợ.",
      href: "dashboard/support",
      href_label: "Hỗ trợ",
      metrics: [
        metric("total", "Tổng yêu cầu", threads.length),
        metric("bug", "Báo lỗi", supportByKind("bug")),
        metric("feature", "Góp ý", supportByKind("feature")),
        metric("support", "Câu hỏi", supportByKind("support")),
        metric("msg_user", "Tin từ người dùng", threads.length),
        metric("msg_admin", "Tin từ hỗ trợ", threads.filter((t) => t.adminReply).length),
      ],
      snapshot: [
        metric("new", "Chưa xem", threads.filter((t) => t.status === "new").length),
        metric("seen", "Đang xử lý", threads.filter((t) => t.status === "seen").length),
        metric("resolved", "Đã xử lý", threads.filter((t) => t.status === "resolved").length),
      ],
      series: [],
      tables: [
        {
          key: "recent",
          title: "Yêu cầu gần đây",
          columns: [
            { label: "Loại", kind: "text" },
            { label: "Nội dung", kind: "text" },
            { label: "Người gửi", kind: "text" },
            { label: "Trạng thái", kind: "status" },
            { label: "Lúc", kind: "datetime" },
          ],
          rows: threads.slice(0, 10).map((t) => [t.kind, t.subject, t.userId ?? "—", t.status, iso(t.createdAt)]),
          empty: "Không có yêu cầu hỗ trợ nào trong kỳ.",
        },
      ],
      note: null,
    },
    {
      key: "audit",
      title: "Nhật ký thao tác",
      description: "Thao tác của người dùng và hệ thống: gói cước, thành viên, quyền, đổi tên Biz...",
      href: "dashboard/activity",
      href_label: "Nhật ký",
      metrics: [
        metric("total", "Tổng thao tác", activities.length),
        metric("by_system", "Do hệ thống", activities.filter((a) => !a.actorId).length),
        metric("actors", "Người thao tác", new Set(activities.map((a) => a.actorId).filter(Boolean)).size),
      ],
      snapshot: [],
      series: [series("total", "Thao tác", "primary", activities.map((a) => ({ at: a.createdAt })))],
      tables: [
        {
          key: "top_actions",
          title: "Thao tác nhiều nhất",
          columns: [
            { label: "Thao tác", kind: "text" },
            { label: "Số lần", kind: "number" },
            { label: "Gần nhất", kind: "datetime" },
          ],
          rows: [...actionCount.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .map(([action, v]) => [action, v.count, iso(v.last)]),
          empty: "Không có thao tác nào trong kỳ.",
        },
      ],
      note: null,
    },
  ];

  return {
    preset: range.preset,
    label: range.label,
    from_at: iso(range.from),
    to_at: iso(range.to),
    prev_from_at: iso(range.prevFrom),
    prev_to_at: iso(range.prevTo),
    timezone: TZ,
    bucket,
    buckets,
    headline: [
      metric("events", "Sự kiện ghi nhận", events, {
        prev: prevEvents,
        hint: "Tổng lượt AI hệ thống gọi, bài khớp từ khoá, lượt AI gọi công cụ MCP và thao tác được ghi nhật ký (trong phạm vi bạn được xem).",
      }),
      metric("errors", "Sự kiện lỗi", errors, {
        hint: "Lượt gọi AI lỗi, lượt tạo chiến dịch tự động lỗi và lượt MCP lỗi.",
        bad: true,
      }),
    ],
    groups,
    elapsed_ms: Date.now() - t0,
  };
}

/**
 * Báo cáo nhóm + so sánh kỳ trước.
 *
 * computeBizGroups chỉ truy vấn đúng khoảng hiện tại; để mỗi metric có `prev`,
 * chạy thêm một lượt với khoảng trước đó rồi ghép theo group.key/metric.key.
 * Tốn thêm một lượt query nhưng đổi lại mọi card đều có trend thật.
 */
export async function getBizGroups(bizId: string, range: ReportRange): Promise<BizGroupsReport> {
  const started = Date.now();
  const current = await computeBizGroups(bizId, range);
  const prevRange: ReportRange = {
    ...range,
    from: range.prevFrom,
    to: range.prevTo,
    prevFrom: range.prevFrom,
    prevTo: range.prevTo,
  };
  const previous = await computeBizGroups(bizId, prevRange).catch(() => null);
  if (!previous) return current;

  const prevHeadline = new Map(previous.headline.map((m) => [m.key, m.value]));
  for (const m of current.headline) {
    const pv = prevHeadline.get(m.key);
    if (typeof pv === "number") {
      m.prev = pv;
      m.trend = m.unit === "text" ? "neutral" : computeTrend(m.value, pv, m.bad);
    }
  }

  const prevGroups = new Map(
    previous.groups.map((g) => [
      g.key,
      {
        metrics: new Map(g.metrics.map((m) => [m.key, m.value])),
        snapshot: new Map(g.snapshot.map((m) => [m.key, m.value])),
      },
    ]),
  );

  for (const g of current.groups) {
    const p = prevGroups.get(g.key);
    if (!p) continue;
    for (const m of [...g.metrics, ...g.snapshot]) {
      const pv = p.metrics.get(m.key) ?? p.snapshot.get(m.key);
      if (typeof pv === "number") {
        m.prev = pv;
        m.trend = m.unit === "text" ? "neutral" : computeTrend(m.value, pv, m.bad);
      }
    }
  }

  current.elapsed_ms = Date.now() - started;
  return current;
}

// ---------------------------------------------------------------------------
// LLM USAGE
// ---------------------------------------------------------------------------

export type LlmUsageV2 = {
  preset: string;
  from_at: string;
  to_at: string;
  prev_from_at: string;
  prev_to_at: string;
  totals: { calls: number; errors: number; tokens_in: number; tokens_out: number; cost_usd: number };
  prev_totals: { calls: number; errors: number; tokens_in: number; tokens_out: number; cost_usd: number };
  by_model: {
    provider: string;
    model: string;
    calls: number;
    errors: number;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
  }[];
  by_provider: { provider: string; calls: number; cost_usd: number }[];
  series: { key: string; label: string; points: number[] }[];
};

export async function getLlmUsageV2(
  bizId: string,
  range: ReportRange,
  filters: { provider?: string | null; model?: string | null } = {},
): Promise<LlmUsageV2> {
  const { buckets } = bucketPlan(range);
  const rows = await db
    .select({
      provider: schema.aiUsages.purpose,
      model: schema.aiUsages.model,
      tokensIn: schema.aiUsages.tokensIn,
      tokensOut: schema.aiUsages.tokensOut,
      cost: schema.aiUsages.costUsd,
      createdAt: schema.aiUsages.createdAt,
    })
    .from(schema.aiUsages)
    .where(and(eq(schema.aiUsages.bizId, bizId), inRange(schema.aiUsages.createdAt, range)));

  const filtered = rows.filter(
    (r) => (!filters.model || r.model === filters.model) && (!filters.provider || r.provider === filters.provider),
  );
  const byModelMap = new Map<string, LlmUsageV2["by_model"][number]>();
  for (const r of filtered) {
    const key = `${r.provider}:${r.model ?? "—"}`;
    const cur =
      byModelMap.get(key) ??
      { provider: r.provider, model: r.model ?? "—", calls: 0, errors: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 };
    cur.calls += 1;
    cur.tokens_in += n(r.tokensIn);
    cur.tokens_out += n(r.tokensOut);
    cur.cost_usd += n(r.cost) / 1_000_000;
    byModelMap.set(key, cur);
  }
  const by_model = [...byModelMap.values()].sort((a, b) => b.calls - a.calls);

  const byProviderMap = new Map<string, { provider: string; calls: number; cost_usd: number }>();
  for (const r of filtered) {
    const cur = byProviderMap.get(r.provider) ?? { provider: r.provider, calls: 0, cost_usd: 0 };
    cur.calls += 1;
    cur.cost_usd += n(r.cost) / 1_000_000;
    byProviderMap.set(r.provider, cur);
  }

  const totals = {
    calls: filtered.length,
    errors: 0,
    tokens_in: filtered.reduce((a, r) => a + n(r.tokensIn), 0),
    tokens_out: filtered.reduce((a, r) => a + n(r.tokensOut), 0),
    cost_usd: filtered.reduce((a, r) => a + n(r.cost), 0) / 1_000_000,
  };

  return {
    preset: range.preset,
    from_at: iso(range.from),
    to_at: iso(range.to),
    prev_from_at: iso(range.prevFrom),
    prev_to_at: iso(range.prevTo),
    totals,
    prev_totals: { calls: 0, errors: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 },
    by_model,
    by_provider: [...byProviderMap.values()],
    series: [
      { key: "calls", label: "Lượt gọi", points: pointsOf(filtered.map((r) => ({ at: r.createdAt })), range, "day", buckets.length) },
    ],
  };
}

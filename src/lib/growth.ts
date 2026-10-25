// Growth preview — kéo số liệu thật từ mọi nguồn đã kết nối của biz.
//
// Một nguồn lỗi/không có data KHÔNG làm mất nguồn khác: mỗi section tự
// try/catch và tự khai báo status. Dùng chung bởi 2 consumer:
//   - UI: /dashboard/growth (thẻ preview + sparkline)
//   - MCP: tool adssync_growth_overview (agent gọi để mở đầu growth review)
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { searchConsoleListSites, searchConsoleQuery, ga4ListProperties, ga4RunReport } from "@/lib/google-data";
import { clarityLiveInsights } from "@/lib/clarity";
import { metaGetInsights } from "@/mcp/tools/meta";

export type GrowthMetric = {
  key: string;
  label: string;
  value: number;
  unit: "number" | "currency" | "percent";
};

export type GrowthSection = {
  source: "search_console" | "ga4" | "clarity" | "meta_ads";
  label: string;
  status: "ok" | "error" | "no_data";
  connectionId: string;
  connectionName: string;
  account: string | null;
  dateRange: { start: string; end: string; label: string };
  metrics: GrowthMetric[];
  series: { label: string; points: number[] }[];
  error: string | null;
};

export type GrowthOverview = {
  generatedAt: string;
  sections: GrowthSection[];
};

const RANGE_28D = { start: daysAgo(28), end: daysAgo(1), label: "28 ngày qua (đến hôm qua)" };
const RANGE_7D = { start: daysAgo(7), end: daysAgo(1), label: "7 ngày qua (đến hôm qua)" };

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
}

const num = (v: unknown, fallback = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
};

// Mỗi adapter nhận connection row đã decrypt sẵn credential_id và trả section.
// Không để adapter throw ra ngoài — lỗi thành section status "error".

async function searchConsoleSection(conn: { id: string; name: string }): Promise<GrowthSection> {
  const base: GrowthSection = {
    source: "search_console", label: "Google Search Console", status: "error",
    connectionId: conn.id, connectionName: conn.name, account: null,
    dateRange: RANGE_28D, metrics: [], series: [], error: null,
  };
  try {
    const sites = await searchConsoleListSites(conn.id);
    const site = sites[0]?.site_url;
    if (!site) return { ...base, status: "no_data", error: "Token chưa có site nào đã xác minh" };
    const res = await searchConsoleQuery(conn.id, site, { dimensions: ["date"], rowLimit: 1000 });
    const rows = [...res.rows].sort((a, b) => String(a.keys[0]).localeCompare(String(b.keys[0])));
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const position = clicks > 0 ? rows.reduce((s, r) => s + r.position * r.clicks, 0) / clicks : 0;
    return {
      ...base, status: rows.length ? "ok" : "no_data", account: site,
      metrics: [
        { key: "clicks", label: "Lượt click", value: clicks, unit: "number" },
        { key: "impressions", label: "Lượt hiển thị", value: impressions, unit: "number" },
        { key: "ctr", label: "CTR", value: impressions > 0 ? (clicks / impressions) * 100 : 0, unit: "percent" },
        { key: "position", label: "Vị trí TB", value: position, unit: "number" },
      ],
      series: [
        { label: "Clicks/ngày", points: rows.map((r) => r.clicks) },
        { label: "Hiển thị/ngày", points: rows.map((r) => r.impressions) },
      ],
    };
  } catch (e: any) {
    return { ...base, error: String(e?.message ?? e).slice(0, 200) };
  }
}

async function ga4Section(conn: { id: string; name: string }): Promise<GrowthSection> {
  const base: GrowthSection = {
    source: "ga4", label: "Google Analytics 4", status: "error",
    connectionId: conn.id, connectionName: conn.name, account: null,
    dateRange: RANGE_28D, metrics: [], series: [], error: null,
  };
  try {
    const props = await ga4ListProperties(conn.id);
    const prop = props[0];
    if (!prop) return { ...base, status: "no_data", error: "Token chưa có property GA4 nào" };
    const res = await ga4RunReport(conn.id, prop.property_id, {
      dimensions: ["date"], metrics: ["sessions", "totalUsers"],
    });
    const rows = [...res.rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const sessions = rows.reduce((s, r) => s + num(r.sessions), 0);
    const users = rows.reduce((s, r) => s + num(r.totalUsers), 0);
    return {
      ...base, status: rows.length ? "ok" : "no_data",
      account: `${prop.property || prop.property_id} (${prop.property_id})`,
      metrics: [
        { key: "sessions", label: "Phiên", value: sessions, unit: "number" },
        { key: "totalUsers", label: "Người dùng", value: users, unit: "number" },
      ],
      series: [{ label: "Sessions/ngày", points: rows.map((r) => num(r.sessions)) }],
    };
  } catch (e: any) {
    return { ...base, error: String(e?.message ?? e).slice(0, 200) };
  }
}

async function claritySection(conn: { id: string; name: string }): Promise<GrowthSection> {
  const base: GrowthSection = {
    source: "clarity", label: "Microsoft Clarity", status: "error",
    connectionId: conn.id, connectionName: conn.name, account: null,
    dateRange: { start: daysAgo(3), end: daysAgo(1), label: "3 ngày gần nhất" },
    metrics: [], series: [], error: null,
  };
  try {
    const res = await clarityLiveInsights(conn.id, { numOfDays: 3 });
    const data = (res as any)?.data ?? res;
    // Clarity trả shape tuỳ dimension — kéo các trường số top-level làm metric.
    const metrics: GrowthMetric[] = [];
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (metrics.length >= 4) break;
      if (typeof v === "number") metrics.push({ key: k, label: k, value: v, unit: "number" });
    }
    return metrics.length
      ? { ...base, status: "ok", metrics }
      : { ...base, status: "no_data", error: "Không có trường số nào ở top-level" };
  } catch (e: any) {
    return { ...base, error: String(e?.message ?? e).slice(0, 200) };
  }
}

async function metaAdsSection(conn: { id: string; name: string }, accountId: string, accountName?: string): Promise<GrowthSection> {
  const base: GrowthSection = {
    source: "meta_ads", label: "Meta Ads", status: "error",
    connectionId: conn.id, connectionName: conn.name, account: accountName ? `${accountName} (${accountId})` : accountId,
    dateRange: RANGE_7D, metrics: [], series: [], error: null,
  };
  try {
    const res = await metaGetInsights(conn.id, accountId, "account");
    const row = (res?.data ?? [])[0];
    if (!row) return { ...base, status: "no_data", error: "Không có chi tiêu trong 7 ngày qua" };
    return {
      ...base, status: "ok",
      metrics: [
        { key: "spend", label: "Chi tiêu", value: num(row.spend), unit: "currency" },
        { key: "impressions", label: "Hiển thị", value: num(row.impressions), unit: "number" },
        { key: "clicks", label: "Click", value: num(row.clicks), unit: "number" },
        { key: "ctr", label: "CTR", value: num(row.ctr), unit: "percent" },
      ],
    };
  } catch (e: any) {
    return { ...base, error: String(e?.message ?? e).slice(0, 200) };
  }
}

const MAX_PER_SOURCE = 2;
const MAX_AD_ACCOUNTS = 3;

export async function growthOverview(bizId: string): Promise<GrowthOverview> {
  const conns = await db.select({
    id: schema.connections.id,
    provider: schema.connections.provider,
    name: schema.connections.name,
    meta: schema.connections.meta,
  }).from(schema.connections).where(eq(schema.connections.bizId, bizId));

  const jobs: Promise<GrowthSection>[] = [];
  const taken = { search_console: 0, ga4: 0, clarity: 0, meta_ads: 0 };

  for (const c of conns) {
    const light = { id: c.id, name: c.name };
    if (c.provider === "google_search_console" && taken.search_console++ < MAX_PER_SOURCE) {
      jobs.push(searchConsoleSection(light));
    } else if (c.provider === "ga4" && taken.ga4++ < MAX_PER_SOURCE) {
      jobs.push(ga4Section(light));
    } else if (c.provider === "clarity" && taken.clarity++ < MAX_PER_SOURCE) {
      jobs.push(claritySection(light));
    } else if (c.provider === "meta_ads" && taken.meta_ads < MAX_PER_SOURCE) {
      const accounts = (((c.meta as Record<string, unknown>)?.adAccounts as { id: string; name?: string }[]) ?? []).slice(0, MAX_AD_ACCOUNTS);
      for (const a of accounts) jobs.push(metaAdsSection(light, a.id, a.name));
    }
  }

  // allSettled: một adapter crash hoàn toàn cũng không kéo cả overview.
  const settled = await Promise.allSettled(jobs);
  const sections = settled.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          source: "meta_ads" as const, label: "Nguồn dữ liệu", status: "error" as const,
          connectionId: "", connectionName: "", account: null, dateRange: RANGE_7D,
          metrics: [], series: [], error: String(r.reason).slice(0, 200),
        },
  );
  return { generatedAt: new Date().toISOString(), sections };
}

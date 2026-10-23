// Truy vấn Chỉ số quảng cáo đa nền tảng — hợp đồng giống API gốc.
// Nguồn hợp đồng: captures/full-2026-10-20/CONTRACTS-RE.md §1.3.
import { db, schema } from "@/db";
import { fetchT } from "./http";
import { eq } from "drizzle-orm";
import {
  AD_CATALOG,
  MAX_QUERY_ACCOUNTS,
  catalogFor,
  isDatePreset,
  isLevel,
  isPlatform,
  metricMap,
  type AdLevel,
  type AdPlatform,
} from "./ad-catalog";
import { evalFormula } from "./formula";
import { decryptSecret } from "./crypto";
import { metaToken, metaSetStatus, metaStatusMap } from "./meta-ads";
import { tiktokToken, tiktokSetStatus } from "./tiktok-ads";
import { googleAdsAuth, googleAdsToken, googleAdsSetStatus } from "./google-ads";

export type AdRange = { preset: string; from?: string | null; to?: string | null };

export type AdQueryBody = {
  platform: AdPlatform;
  level: AdLevel;
  account_keys: string[];
  range: AdRange;
  metrics: string[];
  campaign_ids: string[];
  adset_ids: string[];
  refresh: boolean;
};

export type AdAccountMeta = {
  account_key: string;
  credential_id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone: string | null;
  health_status: string;
  is_active: boolean;
  pages: { page_id: string; name: string }[];
  pages_mode: "all" | "limited";
};

export type AdSource = {
  platform: AdPlatform;
  label: string;
  credential_type: string;
  accounts: AdAccountMeta[];
};

export type AdRow = {
  row_key: string;
  platform: AdPlatform;
  credential_id: string;
  account_id: string;
  account_key: string;
  level: AdLevel;
  id: string;
  name: string;
  status: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  ad_id?: string | null;
  metrics: Record<string, number | null>;
};

export type AdTotals = { by_currency: Record<string, Record<string, number | null>> };

export type AdQueryResult = {
  platform: AdPlatform;
  level: AdLevel;
  accounts: { account_key: string; name: string; currency: string }[];
  rows: AdRow[];
  totals: AdTotals;
  cached?: boolean;
};

const PROVIDER_PLATFORM: Record<string, AdPlatform> = {
  meta_ads: "meta",
  tiktok_ads: "tiktok",
  google_ads: "google",
  openai_ads: "openai_ads",
};

const CREDENTIAL_TYPE: Record<AdPlatform, string> = {
  meta: "facebook_ads",
  tiktok: "tiktok_ads",
  google: "google_ads",
  openai_ads: "openai_ads",
};

// ---------- Ngày tháng (Asia/Ho_Chi_Minh) ----------

export function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function nextMonthStart(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function resolveRange(range: AdRange): { since: string; until: string } {
  const today = vnToday();
  switch (range.preset) {
    case "today":
      return { since: today, until: today };
    case "yesterday": {
      const y = shift(today, -1);
      return { since: y, until: y };
    }
    case "last3":
      return { since: shift(today, -2), until: today };
    case "last7":
      return { since: shift(today, -6), until: today };
    case "this_month":
      return { since: monthStart(today), until: today };
    case "last_month": {
      const start = monthStart(shift(monthStart(today), -1));
      return { since: start, until: shift(monthStart(today), -1) };
    }
    case "this_year":
      return { since: `${today.slice(0, 4)}-01-01`, until: today };
    case "custom": {
      const from = range.from || today;
      const to = range.to || today;
      return from <= to ? { since: from, until: to } : { since: to, until: from };
    }
    default:
      return { since: shift(today, -6), until: today };
  }
}

export function rangeDays(range: AdRange): number {
  const { since, until } = resolveRange(range);
  return daysBetween(since, until) + 1;
}

/** Ngày trước đó cùng độ dài (dùng cho trend prev). */
export function previousRange(range: AdRange): { since: string; until: string } {
  const { since, until } = resolveRange(range);
  const len = daysBetween(since, until) + 1;
  return { since: shift(since, -len), until: shift(until, -len) };
}

// ---------- Validate ----------

export function parseQueryBody(raw: unknown): { ok: true; body: AdQueryBody } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const platform = b.platform;
  if (!isPlatform(platform)) errors.push("Value error, Nền tảng không hợp lệ.");

  const level = b.level;
  if (!isLevel(level)) errors.push("Value error, Cấp dữ liệu không hợp lệ.");

  const accountKeys = Array.isArray(b.account_keys) ? b.account_keys.filter((k): k is string => typeof k === "string") : [];
  if (!accountKeys.length) errors.push("Value error, Chọn ít nhất một tài khoản quảng cáo.");
  if (accountKeys.length > MAX_QUERY_ACCOUNTS) errors.push(`Value error, Tối đa ${MAX_QUERY_ACCOUNTS} tài khoản mỗi lần xem.`);

  const rawRange = (b.range && typeof b.range === "object" ? b.range : { preset: "last7" }) as AdRange;
  if (typeof rawRange.preset !== "string" || !isDatePreset(rawRange.preset)) errors.push("Value error, Khoảng thời gian không hợp lệ.");
  if (rawRange.preset === "custom") {
    const from = rawRange.from ?? null;
    const to = rawRange.to ?? null;
    if (!from || !to) errors.push("Value error, Chọn đủ ngày bắt đầu và ngày kết thúc.");
    else {
      if (from > to) errors.push("Value error, Ngày bắt đầu phải trước ngày kết thúc.");
      if (to > vnToday()) errors.push("Value error, Không chọn được ngày trong tương lai.");
      if (daysBetween(from, to) + 1 > 366) errors.push("Value error, Khoảng tuỳ chỉnh dài tối đa 366 ngày.");
    }
  }

  const metrics = Array.isArray(b.metrics) ? b.metrics.filter((m): m is string => typeof m === "string") : [];
  const validMetrics = isPlatform(platform) ? metricMap(platform) : null;
  if (!metrics.length) errors.push("Value error, Chọn ít nhất một chỉ số.");
  for (const m of metrics) {
    if (validMetrics && !validMetrics.has(m)) errors.push(`Value error, Chỉ số "${m}" không có trên nền tảng này.`);
  }

  const campaignIds = Array.isArray(b.campaign_ids) ? b.campaign_ids.filter((x): x is string => typeof x === "string") : [];
  const adsetIds = Array.isArray(b.adset_ids) ? b.adset_ids.filter((x): x is string => typeof x === "string") : [];

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    body: {
      platform: platform as AdPlatform,
      level: level as AdLevel,
      account_keys: accountKeys.slice(0, MAX_QUERY_ACCOUNTS),
      range: rawRange,
      metrics,
      campaign_ids: campaignIds,
      adset_ids: adsetIds,
      refresh: Boolean(b.refresh),
    },
  };
}

// ---------- Sources ----------

type RawAccount = { id?: string; account_id?: string; advertiser_id?: string; name?: string; advertiser_name?: string; currency?: string; timezone?: string; status?: string | number };

function accountsOf(conn: typeof schema.connections.$inferSelect): RawAccount[] {
  const meta = conn.meta as Record<string, unknown>;
  if (conn.provider === "meta_ads") return (meta.adAccounts as RawAccount[]) ?? [];
  if (conn.provider === "tiktok_ads") return (meta.advertisers as RawAccount[]) ?? [];
  if (conn.provider === "google_ads") {
    if (Array.isArray(meta.customers)) return meta.customers as RawAccount[];
    if (meta.customerId) return [{ id: String(meta.customerId), name: String(meta.customerName ?? meta.customerId) }];
    return [];
  }
  return (meta.adAccounts as RawAccount[]) ?? [];
}

export async function loadSources(bizId: string): Promise<{ platforms: AdSource[] }> {
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.bizId, bizId));
  const out: AdSource[] = [];

  for (const platform of Object.values(PROVIDER_PLATFORM)) {
    const matching = conns.filter((c) => PROVIDER_PLATFORM[c.provider] === platform);
    const accounts: AdAccountMeta[] = [];
    for (const conn of matching) {
      const pages = ((conn.meta as any).pages as { id: string; name: string }[] | undefined) ?? [];
      for (const acc of accountsOf(conn)) {
        const accountId = String(acc.account_id ?? acc.advertiser_id ?? acc.id ?? "").trim();
        if (!accountId) continue;
        accounts.push({
          account_key: `${conn.id}:${accountId}`,
          credential_id: conn.id,
          account_id: accountId,
          name: String(acc.name ?? acc.advertiser_name ?? accountId),
          currency: String(acc.currency ?? "VND"),
          timezone: acc.timezone ? String(acc.timezone) : null,
          health_status: conn.health,
          is_active: conn.health !== "disabled" && conn.health !== "dead",
          pages: pages.map((p) => ({ page_id: p.id, name: p.name })),
          pages_mode: pages.length ? "limited" : "all",
        });
      }
    }
    if (!accounts.length) continue;
    out.push({
      platform,
      label: AD_CATALOG[platform].label,
      credential_type: CREDENTIAL_TYPE[platform],
      accounts,
    });
  }

  return { platforms: out };
}

function findAccount(sources: AdSource[], accountKey: string): AdAccountMeta | null {
  for (const p of sources) {
    const hit = p.accounts.find((a) => a.account_key === accountKey);
    if (hit) return hit;
  }
  return null;
}

// ---------- Cache ----------

const cache = new Map<string, { at: number; data: AdQueryResult }>();
const CACHE_MS = 60_000;

function cacheKey(body: AdQueryBody): string {
  return JSON.stringify({
    p: body.platform,
    l: body.level,
    a: [...body.account_keys].sort(),
    r: body.range,
    m: [...body.metrics].sort(),
    c: [...body.campaign_ids].sort(),
    s: [...body.adset_ids].sort(),
  });
}

// ---------- Mock (dữ liệu demo, không gọi API thật) ----------

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: string): () => number {
  let h = hash(seed) || 1;
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function baseMetricsFor(seed: string, level: AdLevel): Record<string, number> {
  const rnd = seeded(seed);
  const scale = level === "campaign" ? 1 : level === "adset" ? 0.55 : 0.3;
  const spend = Math.round((400_000 + rnd() * 4_600_000) * scale);
  const clicks = Math.round(spend / (2_500 + rnd() * 6_000));
  const impressions = Math.round(clicks * (18 + rnd() * 40));
  const reach = Math.round(impressions / (1.2 + rnd() * 1.8));
  return {
    spend,
    impressions,
    clicks,
    reach,
    actions_purchase: Math.round(clicks * (0.01 + rnd() * 0.06)),
    action_values_purchase: Math.round(spend * (1.4 + rnd() * 2.6)),
    conversion: Math.round(clicks * (0.02 + rnd() * 0.05)),
    conversions: Math.round(clicks * (0.02 + rnd() * 0.05)),
  };
}

function computeMetrics(platform: AdPlatform, base: Record<string, number>, wanted: string[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const cat = catalogFor(platform);
  for (const key of wanted) {
    const def = cat.metrics.find((m) => m.key === key);
    if (!def) continue;
    if (def.agg === "ratio" && def.formula) {
      out[key] = evalFormula(def.formula, base);
    } else {
      out[key] = base[key] ?? 0;
    }
  }
  return out;
}

function mockEntities(platform: AdPlatform, level: AdLevel, account: AdAccountMeta): { id: string; name: string; campaign?: [string, string]; adset?: [string, string] }[] {
  const prefix = level === "campaign" ? "cmp" : level === "adset" ? "as" : "ad";
  const count = level === "campaign" ? 5 : level === "adset" ? 7 : 9;
  const suffix = platform === "meta" ? "Meta" : platform === "tiktok" ? "TikTok" : platform === "google" ? "Google" : "OpenAI";
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}_${account.account_id}_${i + 1}`,
    name: `${suffix} ${level} ${i + 1} · ${account.name}`,
    campaign: level !== "campaign" ? [`cmp_${account.account_id}_${(i % 5) + 1}`, `${suffix} campaign ${(i % 5) + 1}`] : undefined,
    adset: level === "ad" ? [`as_${account.account_id}_${(i % 7) + 1}`, `${suffix} adset ${(i % 7) + 1}`] : undefined,
  }));
}

async function tokenFor(account: AdAccountMeta, loader: (credentialId: string) => Promise<string>): Promise<string> {
  try {
    return await loader(account.credential_id);
  } catch {
    throw new Error(`Kết nối của "${account.name}" cần được kết nối lại (không giải mã được token).`);
  }
}

function isMockConn(conn: { secret: Record<string, string>; meta: Record<string, unknown> }): boolean {
  if (process.env.ADSYNC_MOCK === "1") return true;
  if ((conn.meta as any)?.mock === true) return true;
  try {
    const secret = conn.secret?.enc ? decryptSecret(conn.secret.enc) : (conn.secret as Record<string, string>);
    return String((secret as any)?.access_token ?? "").startsWith("mock_");
  } catch {
    return false;
  }
}

// ---------- Adapters thật ----------

function metaPreset(preset: string): string {
  return (
    {
      today: "today",
      yesterday: "yesterday",
      last3: "last_3d",
      last7: "last_7d",
      this_month: "this_month",
      last_month: "last_month",
      this_year: "this_year",
    } as Record<string, string>
  )[preset] ?? "last_7d";
}

async function fetchMeta(body: AdQueryBody, account: AdAccountMeta, since: string, until: string): Promise<AdRow[]> {
  const token = await tokenFor(account, metaToken);
  const level = body.level;
  const fields = [...new Set([
    `${level}_id`,
    `${level}_name`,
    "campaign_id",
    "campaign_name",
    "adset_id",
    "adset_name",
    "ad_id",
    "spend",
    "impressions",
    "clicks",
    "reach",
    "frequency",
    "ctr",
    "cpc",
    "cpm",
    "cpp",
    "actions",
    "action_values",
    "cost_per_action_type",
    "purchase_roas",
  ])];
  const params = new URLSearchParams({ access_token: token, level, fields: fields.join(","), limit: "500" });
  if (body.range.preset === "custom") params.set("time_range", JSON.stringify({ since, until }));
  else params.set("date_preset", metaPreset(body.range.preset));

  const statusById = await metaStatusMap(token, account.account_id, level);
  const rows: AdRow[] = [];
  let url: string | null = `https://graph.facebook.com/v21.0/${account.account_id}/insights?${params}`;
  let guard = 0;
  while (url && guard++ < 20) {
    const res: Response = await fetchT(url);
    const j: any = await res.json();
    if (j.error) throw new Error(`Meta: ${j.error.message}`);
    for (const r of j.data ?? []) {
      r.effective_status = statusById.get(String(r[`${level}_id`] ?? "")) ?? "UNKNOWN";
      rows.push(metaRow(r, body, account));
    }
    url = j.paging?.next ?? null;
  }
  return rows;
}

function actionValue(list: any[] | undefined, type: string): number {
  const hit = (list ?? []).find((a) => a.action_type === type);
  return hit ? Number(hit.value) || 0 : 0;
}

function metaRow(r: any, body: AdQueryBody, account: AdAccountMeta): AdRow {
  const level = body.level;
  const id = String(r[`${level}_id`] ?? r.ad_id ?? r.adset_id ?? r.campaign_id ?? "");
  const base: Record<string, number> = {
    spend: Number(r.spend ?? 0),
    impressions: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    reach: Number(r.reach ?? 0),
    frequency: Number(r.frequency ?? 0),
    ctr: Number(r.ctr ?? 0),
    cpc: Number(r.cpc ?? 0),
    cpm: Number(r.cpm ?? 0),
    cpp: Number(r.cpp ?? 0),
    actions_purchase: actionValue(r.actions, "purchase") || actionValue(r.actions, "omni_purchase"),
    action_values_purchase: actionValue(r.action_values, "purchase") || actionValue(r.action_values, "omni_purchase"),
    purchase_roas: Number((r.purchase_roas ?? [])[0]?.value ?? 0),
  };
  base.cost_per_action_type_purchase = base.actions_purchase > 0 ? base.spend / base.actions_purchase : 0;

  return {
    row_key: `${body.platform}:${level}:${account.account_key}:${id}`,
    platform: "meta",
    credential_id: account.credential_id,
    account_id: account.account_id,
    account_key: account.account_key,
    level,
    id,
    name: String(r[`${level}_name`] ?? id),
    status: String(r.effective_status ?? r.status ?? "UNKNOWN"),
    campaign_id: r.campaign_id ?? null,
    campaign_name: r.campaign_name ?? null,
    adset_id: r.adset_id ?? null,
    adset_name: r.adset_name ?? null,
    ad_id: r.ad_id ?? null,
    metrics: computeMetrics("meta", base, body.metrics),
  };
}

async function fetchTikTok(body: AdQueryBody, account: AdAccountMeta, since: string, until: string): Promise<AdRow[]> {
  const token = await tokenFor(account, tiktokToken);
  const dataLevel = body.level === "campaign" ? "AUCTION_CAMPAIGN" : body.level === "adset" ? "AUCTION_ADGROUP" : "AUCTION_AD";
  const dimensions = body.level === "campaign" ? ["campaign_id"] : body.level === "adset" ? ["campaign_id", "adgroup_id"] : ["campaign_id", "adgroup_id", "ad_id"];
  const metrics = ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversion", "cost_per_conversion"];
  const url =
    `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=${account.account_id}` +
    `&report_type=BASIC&data_level=${dataLevel}&dimensions=${encodeURIComponent(JSON.stringify(dimensions))}` +
    `&metrics=${encodeURIComponent(JSON.stringify(metrics))}&start_date=${since}&end_date=${until}&page=1&page_size=500`;
  const res = await fetchT(url, { headers: { "Access-Token": token } });
  const j: any = await res.json().catch(() => ({}));
  if (j.code !== 0) throw new Error(`TikTok: ${j.message ?? "Lỗi gọi API"}`);
  return (j.data?.list ?? []).map((item: any) => {
    const dim = item.dimensions ?? {};
    const met = item.metrics ?? {};
    const id = String(dim.ad_id ?? dim.adgroup_id ?? dim.campaign_id ?? "");
    const base: Record<string, number> = {
      spend: Number(met.spend ?? 0),
      impressions: Number(met.impressions ?? 0),
      clicks: Number(met.clicks ?? 0),
      conversion: Number(met.conversion ?? 0),
      conversions: Number(met.conversion ?? 0),
    };
    return {
      row_key: `${body.platform}:${body.level}:${account.account_key}:${id}`,
      platform: "tiktok" as AdPlatform,
      credential_id: account.credential_id,
      account_id: account.account_id,
      account_key: account.account_key,
      level: body.level,
      id,
      name: String(dim.ad_name ?? dim.adgroup_name ?? dim.campaign_name ?? id),
      status: String(item.status ?? "UNKNOWN"),
      campaign_id: dim.campaign_id ?? null,
      campaign_name: dim.campaign_name ?? null,
      adset_id: dim.adgroup_id ?? null,
      adset_name: dim.adgroup_name ?? null,
      ad_id: dim.ad_id ?? null,
      metrics: computeMetrics("tiktok", base, body.metrics),
    };
  });
}

async function fetchGoogle(body: AdQueryBody, account: AdAccountMeta, since: string, until: string): Promise<AdRow[]> {
  const auth = await googleAdsAuth(account.credential_id);
  const level = body.level;
  const from = level === "campaign" ? "campaign" : level === "adset" ? "ad_group" : "ad_group_ad";
  const idField = level === "campaign" ? "campaign.id" : level === "adset" ? "ad_group.id" : "ad_group_ad.ad.id";
  const nameField = level === "campaign" ? "campaign.name" : level === "adset" ? "ad_group.name" : "ad_group_ad.ad.name";
  const query = `SELECT ${idField}, ${nameField}, campaign.id, campaign.name, ad_group.id, ad_group.name,
      metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.average_cpc
    FROM ${from}
    WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "content-type": "application/json",
  };
  if (auth.developerToken) headers["developer-token"] = auth.developerToken;
  if (auth.loginCustomerId) headers["login-customer-id"] = auth.loginCustomerId.replace(/-/g, "");
  const res = await fetchT(
    `https://googleads.googleapis.com/v25/customers/${account.account_id.replace(/-/g, "")}/googleAds:search`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
    },
  );
  const j: any = await res.json().catch(() => ({}));
  if (j.error) throw new Error(`Google Ads: ${j.error.message}`);
  return (j.results ?? []).map((r: any) => {
    const id = String(
      level === "campaign" ? r.campaign?.id : level === "adset" ? r.adGroup?.id : r.adGroupAd?.ad?.id,
    );
    const base: Record<string, number> = {
      spend: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
      impressions: Number(r.metrics?.impressions ?? 0),
      clicks: Number(r.metrics?.clicks ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
      conversion: Number(r.metrics?.conversions ?? 0),
    };
    return {
      row_key: `${body.platform}:${level}:${account.account_key}:${id}`,
      platform: "google" as AdPlatform,
      credential_id: account.credential_id,
      account_id: account.account_id,
      account_key: account.account_key,
      level,
      id,
      name: String(level === "campaign" ? r.campaign?.name : level === "adset" ? r.adGroup?.name : r.adGroupAd?.ad?.name ?? id),
      status: String(r.campaign?.status ?? "UNKNOWN"),
      campaign_id: r.campaign?.id ?? null,
      campaign_name: r.campaign?.name ?? null,
      adset_id: r.adGroup?.id ?? null,
      adset_name: r.adGroup?.name ?? null,
      ad_id: r.adGroupAd?.ad?.id ?? null,
      metrics: computeMetrics("google", base, body.metrics),
    };
  });
}

// ---------- Tổng theo currency ----------

function sumTotals(platform: AdPlatform, rows: AdRow[], currencyOf: (r: AdRow) => string, wanted: string[]): AdTotals {
  const by_currency: Record<string, Record<string, number | null>> = {};
  const cat = catalogFor(platform);
  for (const row of rows) {
    const cur = currencyOf(row);
    by_currency[cur] ??= {};
    for (const key of wanted) {
      if (key in row.metrics) {
        const v = row.metrics[key];
        if (typeof v === "number") by_currency[cur][key] = (by_currency[cur][key] ?? 0) + v;
      }
    }
  }
  // Tính lại các chỉ số ratio từ tổng (đúng cách API gốc trả).
  for (const cur of Object.keys(by_currency)) {
    const totals = by_currency[cur];
    for (const key of wanted) {
      const def = cat.metrics.find((m) => m.key === key);
      if (def?.agg === "ratio" && def.formula) {
        totals[key] = evalFormula(def.formula, totals as Record<string, number>);
      }
    }
  }
  return { by_currency };
}

// ---------- Entry point ----------

export async function runQuery(bizId: string, body: AdQueryBody): Promise<AdQueryResult> {
  const key = cacheKey(body);
  if (!body.refresh) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, cached: true };
  }

  const sources = await loadSources(bizId);
  const platformSource = sources.platforms.find((p) => p.platform === body.platform);
  if (!platformSource) {
    return { platform: body.platform, level: body.level, accounts: [], rows: [], totals: { by_currency: {} } };
  }

  const chosen: AdAccountMeta[] = [];
  for (const k of body.account_keys) {
    const acc = findAccount(sources.platforms, k);
    if (acc && acc.is_active) chosen.push(acc);
  }
  if (!chosen.length) {
    return { platform: body.platform, level: body.level, accounts: [], rows: [], totals: { by_currency: {} } };
  }

  const { since, until } = resolveRange(body.range);
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.bizId, bizId));
  const connById = new Map(conns.map((c) => [c.id, c]));

  const rows: AdRow[] = [];
  for (const acc of chosen) {
    const conn = connById.get(acc.credential_id);
    const mock = conn ? isMockConn(conn as any) : false;
    if (mock) {
      for (const e of mockEntities(body.platform, body.level, acc)) {
        const base = baseMetricsFor(`${acc.account_key}:${e.id}:${since}:${until}`, body.level);
        if (body.level !== "campaign" && body.campaign_ids.length && !body.campaign_ids.includes(e.campaign![0])) continue;
        if (body.level === "ad" && body.adset_ids.length && !body.adset_ids.includes(e.adset![0])) continue;
        const rnd = seeded(`${acc.account_key}:${e.id}:${since}`);
        rows.push({
          row_key: `${body.platform}:${body.level}:${acc.account_key}:${e.id}`,
          platform: body.platform,
          credential_id: acc.credential_id,
          account_id: acc.account_id,
          account_key: acc.account_key,
          level: body.level,
          id: e.id,
          name: e.name,
          status: rnd() > 0.25 ? "ACTIVE" : "PAUSED",
          campaign_id: e.campaign?.[0] ?? e.id,
          campaign_name: e.campaign?.[1] ?? e.name,
          adset_id: e.adset?.[0] ?? (body.level === "adset" ? e.id : null),
          adset_name: e.adset?.[1] ?? (body.level === "adset" ? e.name : null),
          ad_id: body.level === "ad" ? e.id : null,
          metrics: computeMetrics(body.platform, base, body.metrics),
        });
      }
      continue;
    }

    if (body.platform === "meta") rows.push(...(await fetchMeta(body, acc, since, until)));
    else if (body.platform === "tiktok") rows.push(...(await fetchTikTok(body, acc, since, until)));
    else if (body.platform === "google") rows.push(...(await fetchGoogle(body, acc, since, until)));
  }

  const accounts = chosen.map((a) => ({ account_key: a.account_key, name: a.name, currency: a.currency }));
  const currencyByKey = new Map(accounts.map((a) => [a.account_key, a.currency]));
  const totals = sumTotals(body.platform, rows, (r) => currencyByKey.get(r.account_key) ?? "VND", body.metrics);

  const result: AdQueryResult = { platform: body.platform, level: body.level, accounts, rows, totals };
  cache.set(key, { at: Date.now(), data: result });
  return result;
}

export async function toggleEntity(input: {
  bizId: string;
  platform: AdPlatform;
  credential_id: string;
  account_id: string;
  level: AdLevel;
  entity_id: string;
  adset_id?: string;
  status: "ACTIVE" | "PAUSED";
}) {
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.bizId, input.bizId));
  const conn = conns.find((c) => c.id === input.credential_id);
  if (!conn) return { ok: false, entity_id: input.entity_id, status: null, error: "Kết nối không tồn tại." };

  const mock = isMockConn(conn as any);
  if (!mock) {
    if (input.platform === "meta") {
      const token = await metaToken(input.credential_id);
      await metaSetStatus(token, input.entity_id, input.status);
    } else if (input.platform === "tiktok") {
      const token = await tiktokToken(input.credential_id);
      await tiktokSetStatus(token, input.account_id, input.entity_id, input.status === "ACTIVE" ? "ENABLE" : "DISABLE");
    } else if (input.platform === "google") {
      const auth = await googleAdsAuth(input.credential_id);
      await googleAdsSetStatus({
        token: auth.token,
        developerToken: auth.developerToken ?? undefined,
        loginCustomerId: auth.loginCustomerId ?? undefined,
        customerId: input.account_id,
        campaignId: input.entity_id,
        status: input.status === "ACTIVE" ? "ENABLED" : "PAUSED",
      });
    }
  }

  cache.clear();
  return { ok: true, entity_id: input.entity_id, status: input.status };
}

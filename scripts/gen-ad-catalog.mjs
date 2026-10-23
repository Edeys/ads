/**
 * Sinh src/lib/ad-catalog.ts từ response thật đã capture
 * (captures/full-2026-10-20/contracts/GET_ad-metrics_api_ad_metrics_catalog.json).
 *
 *   node scripts/gen-ad-catalog.mjs
 *
 * Chỉ dùng nội bộ: file sinh ra chứa metadata công khai của Done.vn API,
 * không chứa mã nguồn của họ.
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = JSON.parse(
  readFileSync("captures/full-2026-10-20/contracts/GET_ad-metrics_api_ad_metrics_catalog.json", "utf8"),
).body;

const PLATFORM_LABEL = {
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  google: "Google Ads",
  openai_ads: "OpenAI Ads",
};

const json = (v) => JSON.stringify(v, null, 2);

let out = `// TỰ SINH bởi scripts/gen-ad-catalog.mjs — đừng sửa tay.
// Nguồn: catalog API thật của app.done.vn (capture 2026-10-20).
// Đây là metadata công khai (tên chỉ số, công thức), không phải mã nguồn của họ.

export type AdPlatform = "meta" | "tiktok" | "google" | "openai_ads";
export type AdLevel = "campaign" | "adset" | "ad";
export type MetricFormat = "number" | "currency" | "percent" | "decimal" | "text";
export type MetricAgg = "sum" | "none" | "ratio";

export type MetricDef = {
  key: string;
  label: string;
  group: string;
  format: MetricFormat;
  agg: MetricAgg;
  formula?: string;
  description?: string;
};

export type PlatformCatalog = {
  label: string;
  levels: AdLevel[];
  has_parent_ids: boolean;
  default_columns: string[];
  metrics: MetricDef[];
};

export const AD_PLATFORMS: AdPlatform[] = ["meta", "tiktok", "google", "openai_ads"];
export const AD_LEVELS: AdLevel[] = ["campaign", "adset", "ad"];
export const DATE_PRESETS = ${json(src.date_presets)} as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

// Giới hạn do API/UI gốc áp dụng (module 3113 của bundle).
export const MAX_QUERY_ACCOUNTS = 30;
export const MAX_VIEW_COLUMNS = 60;
export const MAX_CUSTOM_FIELDS = 20;
export const MAX_CUSTOM_DECIMALS = 4;
export const MAX_CUSTOM_LABEL_LENGTH = 60;
export const MAX_FORMULA_LENGTH = 300;
export const CUSTOM_FIELD_KEY_RE = /^cf_[a-z0-9_]{1,40}$/;

export function isPlatform(v: unknown): v is AdPlatform {
  return typeof v === "string" && (AD_PLATFORMS as string[]).includes(v);
}

export function isLevel(v: unknown): v is AdLevel {
  return typeof v === "string" && (AD_LEVELS as string[]).includes(v);
}

export function isDatePreset(v: unknown): v is DatePreset {
  return typeof v === "string" && DATE_PRESETS.some((p) => p.value === v);
}

export const PLATFORM_LABEL: Record<AdPlatform, string> = ${json(PLATFORM_LABEL)};

export const AD_CATALOG: Record<AdPlatform, PlatformCatalog> = {
`;

for (const p of ["meta", "tiktok", "google", "openai_ads"]) {
  const c = src.platforms[p];
  out += `  ${p}: {\n    label: ${JSON.stringify(PLATFORM_LABEL[p])},\n    levels: ${json(c.levels)},\n    has_parent_ids: ${c.has_parent_ids},\n    default_columns: ${json(c.default_columns)},\n    metrics: ${json(c.metrics)},\n  },\n`;
}

out += `};

export function catalogFor(platform: AdPlatform): PlatformCatalog {
  return AD_CATALOG[platform];
}

export function metricMap(platform: AdPlatform): Map<string, MetricDef> {
  return new Map(AD_CATALOG[platform].metrics.map((m) => [m.key, m]));
}

export function defaultColumns(platform: AdPlatform): string[] {
  return [...AD_CATALOG[platform].default_columns];
}
`;

writeFileSync("src/lib/ad-catalog.ts", out, "utf8");
console.log("wrote src/lib/ad-catalog.ts", out.length, "bytes");

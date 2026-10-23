// TỰ SINH bởi scripts/gen-ad-catalog.mjs — đừng sửa tay.
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
export const DATE_PRESETS = [
  {
    "value": "today",
    "label": "Hôm nay"
  },
  {
    "value": "yesterday",
    "label": "Hôm qua"
  },
  {
    "value": "last3",
    "label": "3 ngày qua"
  },
  {
    "value": "last7",
    "label": "7 ngày qua"
  },
  {
    "value": "this_month",
    "label": "Tháng này"
  },
  {
    "value": "last_month",
    "label": "Tháng trước"
  },
  {
    "value": "this_year",
    "label": "Năm nay"
  },
  {
    "value": "custom",
    "label": "Tùy chỉnh"
  }
] as const;

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

export const PLATFORM_LABEL: Record<AdPlatform, string> = {
  "meta": "Meta Ads",
  "tiktok": "TikTok Ads",
  "google": "Google Ads",
  "openai_ads": "OpenAI Ads"
};

export const AD_CATALOG: Record<AdPlatform, PlatformCatalog> = {
  meta: {
    label: "Meta Ads",
    levels: [
  "campaign",
  "adset",
  "ad"
],
    has_parent_ids: true,
    default_columns: [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "actions_purchase",
  "purchase_roas"
],
    metrics: [
  {
    "key": "spend",
    "label": "Chi tiêu",
    "group": "Chi phí",
    "format": "currency",
    "agg": "sum"
  },
  {
    "key": "impressions",
    "label": "Hiển thị",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "clicks",
    "label": "Lượt nhấp",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "reach",
    "label": "Tiếp cận",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "none"
  },
  {
    "key": "frequency",
    "label": "Tần suất",
    "group": "Hiệu suất",
    "format": "decimal",
    "agg": "ratio",
    "formula": "{impressions}/{reach}"
  },
  {
    "key": "ctr",
    "label": "CTR",
    "group": "Hiệu suất",
    "format": "percent",
    "agg": "ratio",
    "formula": "{clicks}/{impressions}*100"
  },
  {
    "key": "cpc",
    "label": "CPC",
    "group": "Chi phí",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{clicks}"
  },
  {
    "key": "cpm",
    "label": "CPM",
    "group": "Chi phí",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{impressions}*1000"
  },
  {
    "key": "cpp",
    "label": "CPP",
    "group": "Chi phí",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{reach}*1000"
  },
  {
    "key": "actions_purchase",
    "label": "Lượt mua",
    "group": "Chuyển đổi",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "action_values_purchase",
    "label": "Giá trị mua",
    "group": "Chuyển đổi",
    "format": "currency",
    "agg": "sum"
  },
  {
    "key": "cost_per_action_type_purchase",
    "label": "Chi phí/lượt mua",
    "group": "Chuyển đổi",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{actions_purchase}"
  },
  {
    "key": "purchase_roas",
    "label": "ROAS mua",
    "group": "Chuyển đổi",
    "format": "decimal",
    "agg": "ratio",
    "formula": "{action_values_purchase}/{spend}"
  }
],
  },
  tiktok: {
    label: "TikTok Ads",
    levels: [
  "campaign",
  "adset",
  "ad"
],
    has_parent_ids: true,
    default_columns: [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "conversion"
],
    metrics: [
  {
    "key": "spend",
    "label": "Chi tiêu",
    "group": "Chi phí",
    "format": "currency",
    "agg": "sum"
  },
  {
    "key": "impressions",
    "label": "Hiển thị",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "clicks",
    "label": "Lượt nhấp",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "ctr",
    "label": "CTR",
    "group": "Hiệu suất",
    "format": "percent",
    "agg": "ratio",
    "formula": "{clicks}/{impressions}*100"
  },
  {
    "key": "cpc",
    "label": "CPC",
    "group": "Chi phí",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{clicks}"
  },
  {
    "key": "cpm",
    "label": "CPM",
    "group": "Chi phí",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{impressions}*1000"
  },
  {
    "key": "conversion",
    "label": "Chuyển đổi",
    "group": "Chuyển đổi",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "cost_per_conversion",
    "label": "Chi phí/chuyển đổi",
    "group": "Chuyển đổi",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{conversion}"
  }
],
  },
  google: {
    label: "Google Ads",
    levels: [
  "campaign",
  "adset",
  "ad"
],
    has_parent_ids: true,
    default_columns: [
  "spend",
  "impressions",
  "clicks",
  "average_cpc",
  "conversions"
],
    metrics: [
  {
    "key": "spend",
    "label": "Chi tiêu",
    "group": "Chi phí",
    "format": "currency",
    "agg": "sum"
  },
  {
    "key": "impressions",
    "label": "Hiển thị",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "clicks",
    "label": "Lượt nhấp",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "average_cpc",
    "label": "CPC TB",
    "group": "Chi phí",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{clicks}"
  },
  {
    "key": "conversions",
    "label": "Chuyển đổi",
    "group": "Chuyển đổi",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "cost_per_conversion",
    "label": "Chi phí/chuyển đổi",
    "group": "Chuyển đổi",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{conversions}"
  }
],
  },
  openai_ads: {
    label: "OpenAI Ads",
    levels: [
  "campaign",
  "adset",
  "ad"
],
    has_parent_ids: false,
    default_columns: [
  "spend",
  "impressions",
  "clicks",
  "cpc",
  "cpm"
],
    metrics: [
  {
    "key": "spend",
    "label": "Chi tiêu",
    "group": "Chi phí",
    "format": "currency",
    "agg": "sum"
  },
  {
    "key": "impressions",
    "label": "Hiển thị",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "clicks",
    "label": "Lượt nhấp",
    "group": "Hiệu suất",
    "format": "number",
    "agg": "sum"
  },
  {
    "key": "cpc",
    "label": "CPC",
    "group": "Chi phí",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{clicks}"
  },
  {
    "key": "cpm",
    "label": "CPM",
    "group": "Chi phí",
    "format": "currency",
    "agg": "ratio",
    "formula": "{spend}/{impressions}*1000"
  }
],
  },
};

export function catalogFor(platform: AdPlatform): PlatformCatalog {
  return AD_CATALOG[platform];
}

export function metricMap(platform: AdPlatform): Map<string, MetricDef> {
  return new Map(AD_CATALOG[platform].metrics.map((m) => [m.key, m]));
}

export function defaultColumns(platform: AdPlatform): string[] {
  return [...AD_CATALOG[platform].default_columns];
}

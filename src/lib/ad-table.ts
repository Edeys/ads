// Danh mục cột của bảng Chỉ số quảng cáo + kiểu cấu hình bảng (mỗi người, mỗi nền tảng).
import type { CustomField, FormulaFormat } from "./formula";

export type ColumnFormat = "text" | "number" | "currency" | "percent";

export type ColumnDef = {
  key: string;
  label: string;
  group: "Hiệu suất" | "Chi phí" | "Chuyển đổi";
  format: ColumnFormat;
  description?: string;
};

export const AD_PLATFORMS = [
  { key: "meta", label: "Meta Ads" },
  { key: "tiktok", label: "TikTok Ads" },
  { key: "google", label: "Google Ads" },
] as const;

export type AdPlatform = (typeof AD_PLATFORMS)[number]["key"];

export const AD_LEVELS = [
  { key: "campaign", label: "Chiến dịch" },
  { key: "adset", label: "Nhóm quảng cáo" },
  { key: "ad", label: "Quảng cáo" },
] as const;

export type AdLevel = (typeof AD_LEVELS)[number]["key"];

// Cột tên thực thể luôn đứng đầu, không tắt được.
export const NAME_COLUMN = "name";

export const AD_COLUMNS: ColumnDef[] = [
  { key: "spend", label: "Chi tiêu", group: "Chi phí", format: "currency" },
  { key: "impressions", label: "Hiển thị", group: "Hiệu suất", format: "number" },
  { key: "clicks", label: "Lượt nhấp", group: "Hiệu suất", format: "number" },
  { key: "ctr", label: "CTR", group: "Hiệu suất", format: "percent" },
  { key: "cpc", label: "CPC", group: "Chi phí", format: "currency" },
  { key: "cpm", label: "CPM", group: "Chi phí", format: "currency" },
  { key: "conversions", label: "Lượt mua", group: "Chuyển đổi", format: "number" },
  { key: "cpa", label: "CP/mua", group: "Chi phí", format: "currency" },
];

export const DEFAULT_COLUMN_KEYS = ["spend", "impressions", "clicks", "ctr", "cpc", "conversions", "cpa"];

export type TableColumn = { key: string; starred?: boolean };

export type TableLayout = {
  platform: AdPlatform;
  columns: TableColumn[];
  mergeAccounts: boolean;
  defaultLevel: AdLevel;
  customFields: CustomField[];
};

export const DEFAULT_LAYOUT: Omit<TableLayout, "platform"> = {
  columns: DEFAULT_COLUMN_KEYS.map((key) => ({ key, starred: false })),
  mergeAccounts: false,
  defaultLevel: "campaign",
  customFields: [],
};

export function columnDef(key: string): ColumnDef | undefined {
  return AD_COLUMNS.find((c) => c.key === key);
}

export function columnLabel(key: string, customFields: CustomField[] = []): string {
  if (key === NAME_COLUMN) return "Tên";
  return columnDef(key)?.label ?? customFields.find((f) => f.key === key)?.name ?? key;
}

/** Trả về layout đã chuẩn hoá: bỏ cột lạ, thêm cột tên, giới hạn số trường tuỳ chỉnh. */
export function normalizeLayout(platform: AdPlatform, raw: unknown): TableLayout {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<TableLayout>;
  const validKeys = new Set(AD_COLUMNS.map((c) => c.key));
  const customFields = Array.isArray(src.customFields)
    ? src.customFields
        .filter((f) => f && typeof f.key === "string" && typeof f.name === "string" && typeof f.formula === "string")
        .slice(0, 8)
        .map((f) => ({
          key: f.key,
          name: f.name.slice(0, 40),
          formula: f.formula.slice(0, 300),
          format: (["number", "currency", "percent", "decimal"] as FormulaFormat[]).includes(f.format) ? f.format : "decimal",
          decimals: Math.max(0, Math.min(4, Number(f.decimals) || 2)),
        }))
    : [];
  const customKeys = new Set(customFields.map((f) => f.key));

  const seen = new Set<string>();
  const columns: TableColumn[] = [{ key: NAME_COLUMN }];
  for (const c of Array.isArray(src.columns) ? src.columns : []) {
    const key = typeof c === "string" ? c : c?.key;
    if (!key || seen.has(key) || key === NAME_COLUMN) continue;
    if (!validKeys.has(key) && !customKeys.has(key)) continue;
    seen.add(key);
    columns.push({ key, starred: Boolean(typeof c === "object" && c?.starred) });
  }
  if (columns.length === 1) {
    for (const key of DEFAULT_COLUMN_KEYS) if (!seen.has(key)) { seen.add(key); columns.push({ key, starred: false }); }
  }

  return {
    platform,
    columns,
    mergeAccounts: Boolean(src.mergeAccounts),
    defaultLevel: (["campaign", "adset", "ad"].includes(String(src.defaultLevel)) ? src.defaultLevel : "campaign") as AdLevel,
    customFields,
  };
}

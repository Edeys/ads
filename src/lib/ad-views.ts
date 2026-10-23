// Chuẩn hoá "view" của bảng Chỉ số quảng cáo — bám đúng hợp đồng API gốc.
// Nguồn: captures/full-2026-10-20/CONTRACTS-RE.md §1.4.
import {
  CUSTOM_FIELD_KEY_RE,
  MAX_CUSTOM_DECIMALS,
  MAX_CUSTOM_FIELDS,
  MAX_CUSTOM_LABEL_LENGTH,
  MAX_VIEW_COLUMNS,
  catalogFor,
  type AdLevel,
  type AdPlatform,
} from "./ad-catalog";
import { validateFormula, type CustomField, type FormulaFormat } from "./formula";

export type AdViewConfig = {
  columns: string[];
  highlights: string[];
  merge_accounts: boolean;
  default_level: AdLevel;
  custom_fields: CustomField[];
};

const FORMATS: FormulaFormat[] = ["number", "currency", "percent", "decimal"];

/** View mặc định khi chưa lưu gì. */
export function defaultView(platform: AdPlatform): AdViewConfig {
  const cat = catalogFor(platform);
  return {
    columns: [...cat.default_columns],
    highlights: [],
    merge_accounts: true,
    default_level: cat.levels.includes("campaign") ? "campaign" : cat.levels[0] ?? "campaign",
    custom_fields: [],
  };
}

function normalizeCustomFields(platform: AdPlatform, raw: unknown): CustomField[] {
  const allowed = catalogFor(platform).metrics.map((m) => m.key);
  const out: CustomField[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    const f = item as Partial<CustomField> & { label?: string; decimals?: number | null };
    if (typeof f.key !== "string" || !CUSTOM_FIELD_KEY_RE.test(f.key)) continue;
    if (typeof f.formula !== "string" || !f.formula.trim()) continue;
    if (validateFormula(f.formula, allowed).ok === false) continue; // công thức sai → bỏ
    if (seen.has(f.key)) continue; // trùng key → bỏ
    const label = (typeof f.label === "string" ? f.label.trim() : "").slice(0, MAX_CUSTOM_LABEL_LENGTH) || f.key;
    const format = FORMATS.includes(f.format as FormulaFormat) ? (f.format as FormulaFormat) : "decimal";
    const decimals =
      typeof f.decimals === "number" && Number.isFinite(f.decimals)
        ? Math.min(MAX_CUSTOM_DECIMALS, Math.max(0, Math.round(f.decimals)))
        : 2;
    seen.add(f.key);
    out.push({ key: f.key, name: label, formula: f.formula, format, decimals });
    if (out.length >= MAX_CUSTOM_FIELDS) break;
  }
  return out;
}

/** Chuẩn hoá view đã lưu theo catalog hiện tại (cột lạ bị loại, thứ tự giữ nguyên). */
export function normalizeView(platform: AdPlatform, saved: unknown): AdViewConfig {
  const base = defaultView(platform);
  if (!saved || typeof saved !== "object") return base;
  const s = saved as Partial<AdViewConfig> & { defaultLevel?: AdLevel; mergeAccounts?: boolean; customFields?: unknown };
  const allowed = new Set(catalogFor(platform).metrics.map((m) => m.key));

  const rawCols = Array.isArray(s.columns) ? s.columns : [];
  const cols: string[] = [];
  for (const c of rawCols) {
    if (typeof c === "string" && allowed.has(c) && !cols.includes(c)) cols.push(c);
    if (cols.length >= MAX_VIEW_COLUMNS) break;
  }
  const columns = cols.length ? cols : [...base.columns];

  const rawHi = Array.isArray(s.highlights) ? s.highlights : [];
  const highlights = rawHi.filter((h): h is string => typeof h === "string" && columns.includes(h));

  const merge =
    typeof s.merge_accounts === "boolean"
      ? s.merge_accounts
      : typeof s.mergeAccounts === "boolean"
        ? s.mergeAccounts
        : base.merge_accounts;

  const levels = catalogFor(platform).levels;
  const wantedLevel = (s.default_level ?? s.defaultLevel) as AdLevel | undefined;
  const default_level = wantedLevel && levels.includes(wantedLevel) ? wantedLevel : base.default_level;

  const custom_fields = normalizeCustomFields(platform, s.custom_fields ?? s.customFields);

  return { columns, highlights, merge_accounts: merge, default_level, custom_fields };
}

/** So sánh 2 view (dùng để biết có thay đổi chưa lưu hay không). */
export function isSameView(a: AdViewConfig, b: AdViewConfig): boolean {
  if (a.merge_accounts !== b.merge_accounts) return false;
  if (a.default_level !== b.default_level) return false;
  if (a.columns.join("|") !== b.columns.join("|")) return false;
  if ([...a.highlights].sort().join("|") !== [...b.highlights].sort().join("|")) return false;
  if (a.custom_fields.length !== b.custom_fields.length) return false;
  return a.custom_fields.every((f, i) => {
    const g = b.custom_fields[i];
    return f.key === g.key && f.formula === g.formula && f.format === g.format && f.decimals === g.decimals;
  });
}

/** Tập metric cần lấy từ API: cột hiển thị + metric mà công thức tuỳ chỉnh tham chiếu. */
export function requiredMetrics(platform: AdPlatform, view: AdViewConfig): string[] {
  const set = new Set<string>(view.columns);
  const allowed = new Set(catalogFor(platform).metrics.map((m) => m.key));
  for (const f of view.custom_fields) {
    for (const m of f.formula.matchAll(/\{([^}]+)\}/g)) {
      const key = m[1].trim();
      if (allowed.has(key)) set.add(key);
    }
  }
  return [...set];
}

/** Key của field tuỳ chỉnh mới, không đụng field đã có. */
export function makeCustomFieldKey(existing: string[], seed = Date.now().toString(36)): string {
  let n = 0;
  let key = `cf_${seed.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 32) || "field"}`;
  while (existing.includes(key)) {
    n += 1;
    key = `cf_${seed.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 30)}${n}`;
  }
  return key;
}

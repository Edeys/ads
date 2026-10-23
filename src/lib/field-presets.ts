// Bộ chỉ số (field presets) — mô hình thật của Done.vn:
// - Mỗi preset thuộc 1 nền tảng, cấu hình theo từng loại dữ liệu (entity).
// - "Tối giản" là bộ hệ thống, ẩn danh: entity không được chọn field nào sẽ dùng đúng bộ này.
// - Preset "Hệ thống đề xuất" do nền tảng soạn sẵn, chỉ xem.
// - Preset tự tạo: tạo/xem/xoá, KHÔNG sửa (đúng quy tắc Done.vn).
// - Khi tạo MCP key, cấu hình được sao chép vào key và chạy độc lập.
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import {
  ENTITIES_BY_PROVIDER,
  ENTITY_BY_KEY,
  PRESET_PROVIDERS,
  SYSTEM_PRESETS,
  type EntityDef,
} from "./field-catalog";

export const MINIMAL = "toi-gian" as const;
export type EntityFieldConfig = Record<string, string[] | typeof MINIMAL>;

export const PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  PRESET_PROVIDERS.map((p) => [p.key, p.label]),
);

export type PresetKind = "minimal" | "system" | "custom";

export type PresetData = {
  id: string;
  provider: string;
  name: string;
  description: string;
  config: EntityFieldConfig;
  kind: PresetKind;
  isSystem: boolean;
};

export function entitiesOf(provider: string): EntityDef[] {
  return ENTITIES_BY_PROVIDER[provider] ?? [];
}

export function minimalConfig(provider: string): EntityFieldConfig {
  return Object.fromEntries(entitiesOf(provider).map((e) => [e.entity, MINIMAL]));
}

export function minimalPresetId(provider: string) {
  return `sys:${provider}:minimal`;
}

/** Danh sách preset hệ thống: "Tối giản" (mọi nền tảng) + "Hệ thống đề xuất" (nếu có). */
export function listSystemPresets(): PresetData[] {
  const out: PresetData[] = [];
  for (const p of PRESET_PROVIDERS) {
    out.push({
      id: minimalPresetId(p.key),
      provider: p.key,
      name: "Tối giản",
      description: "Bộ trường cốt lõi do hệ thống chọn sẵn cho từng loại dữ liệu. Đây là lựa chọn mặc định khi tạo MCP key.",
      config: minimalConfig(p.key),
      kind: "minimal",
      isSystem: true,
    });
  }
  for (const p of SYSTEM_PRESETS) {
    out.push({
      id: `sys:${p.id}`,
      provider: p.provider,
      name: p.name,
      description: p.description,
      config: normalizeConfig(p.provider, p.config),
      kind: "system",
      isSystem: true,
    });
  }
  return out;
}

export function findSystemPreset(presetId?: string | null): PresetData | undefined {
  if (!presetId) return undefined;
  return listSystemPresets().find((p) => p.id === presetId);
}

/** Chuẩn hoá config: bỏ field lạ, bỏ entity lạ, entity rỗng ⇒ "toi-gian". */
export function normalizeConfig(provider: string, raw: unknown): EntityFieldConfig {
  const out: EntityFieldConfig = {};
  const entities = entitiesOf(provider);
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const e of entities) {
    const value = src[e.entity];
    if (!Array.isArray(value)) continue;
    const valid = new Set(e.fields.map((f) => f.key));
    const fields = Array.from(new Set(value.map(String).filter((f) => valid.has(f))));
    out[e.entity] = fields.length ? fields : MINIMAL;
  }
  return out;
}

/** Field hiệu lực của 1 entity: mảng đã chọn, hoặc bộ tối giản nếu để trống. */
export function effectiveFields(provider: string, entity: string, config?: EntityFieldConfig | null): string[] | null {
  const value = config?.[entity];
  if (Array.isArray(value) && value.length) return value;
  return ENTITY_BY_KEY[entity]?.minimal ?? null;
}

/** Snapshot config của preset để gắn vào key (entity thiếu ⇒ tối giản). */
export function snapshotConfig(provider: string, config?: EntityFieldConfig | null): EntityFieldConfig {
  const out: EntityFieldConfig = {};
  for (const e of entitiesOf(provider)) {
    const value = config?.[e.entity];
    out[e.entity] = Array.isArray(value) && value.length ? value : MINIMAL;
  }
  return out;
}

export function countFields(config?: EntityFieldConfig | null): number {
  if (!config) return 0;
  return Object.values(config).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
}

/** Cắt payload tool theo danh sách field, hỗ trợ field lồng nhau kiểu "shippingAddress.name". */
export function applyFieldPreset(payload: any, fields: string[] | null): any {
  if (!fields || !fields.length || !payload || typeof payload !== "object") return payload;

  const tree: Record<string, any> = {};
  for (const path of fields) {
    const parts = path.split(".");
    let node = tree;
    for (let i = 0; i < parts.length; i += 1) {
      const key = parts[i];
      if (i === parts.length - 1) node[key] = true;
      else {
        if (node[key] === true) break;
        node[key] ??= {};
        node = node[key];
      }
    }
  }

  const prune = (row: any, node: Record<string, any>): any => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const out: Record<string, any> = {};
    for (const [key, sub] of Object.entries(node)) {
      if (!(key in row)) continue;
      out[key] = sub === true ? row[key] : prune(row[key], sub);
    }
    return out;
  };

  const filterRow = (row: any): any => (Array.isArray(row) ? row.map(filterRow) : prune(row, tree));

  if (Array.isArray(payload)) return payload.map(filterRow);
  if (Array.isArray(payload.data)) return { ...payload, data: payload.data.map(filterRow) };
  if (Array.isArray(payload.data?.list)) return { ...payload, data: { ...payload.data, list: payload.data.list.map(filterRow) } };
  if (Array.isArray(payload.result?.list)) return { ...payload, result: { ...payload.result, list: payload.result.list.map(filterRow) } };
  if (Array.isArray(payload.data?.data)) return { ...payload, data: { ...payload.data, data: payload.data.data.map(filterRow) } };
  return filterRow(payload);
}

/** Nạp preset (hệ thống hoặc custom của Biz) thành config đầy đủ. */
export async function loadPresetConfig(bizId: string, provider: string, presetId?: string | null): Promise<EntityFieldConfig | null> {
  if (!presetId) return null;
  const sys = findSystemPreset(presetId);
  if (sys) return sys.provider === provider ? sys.config : null;
  if (!/^[0-9a-f-]{36}$/i.test(presetId)) return null;
  const [row] = await db.select().from(schema.fieldPresets)
    .where(and(eq(schema.fieldPresets.id, presetId), eq(schema.fieldPresets.bizId, bizId)))
    .limit(1);
  if (!row || row.provider !== provider) return null;
  return normalizeConfig(provider, row.config ?? row.fields);
}

export function describePreset(presetId?: string | null): string {
  if (!presetId) return "toàn bộ field mặc định";
  const sys = findSystemPreset(presetId);
  if (sys) return `${sys.name} (${countFields(sys.config)} field)`;
  return "bộ chỉ số tuỳ chỉnh";
}

export function providerLabel(provider: string) {
  return PROVIDER_LABEL[provider] ?? provider;
}

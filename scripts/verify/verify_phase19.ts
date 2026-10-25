// Verify Phase 19: Bộ chỉ số theo entity (mô hình thật của Done.vn).
// Chạy khi server local ĐANG TẮT (PGlite chỉ 1 process): npx tsx scripts/verify_phase19.ts
import { db, schema } from "../../src/db";
import { eq } from "drizzle-orm";
import { sha256 } from "../../src/lib/crypto";
import { ENTITIES, ENTITIES_BY_PROVIDER, ENTITY_BY_KEY, PRESET_PROVIDERS } from "../../src/lib/field-catalog";
import {
  applyFieldPreset,
  countFields,
  effectiveFields,
  listSystemPresets,
  loadPresetConfig,
  normalizeConfig,
  snapshotConfig,
} from "../../src/lib/field-presets";

async function main() {
  // 1) Catalog
  console.log("[1] providers:", PRESET_PROVIDERS.length, "| entities:", ENTITIES.length);
  if (PRESET_PROVIDERS.length !== 14) throw new Error("phải có 14 nền tảng");
  const meta = ENTITY_BY_KEY["meta.insights"];
  console.log("    meta.insights:", meta.fields.length, "field | tối giản:", meta.minimal.length);
  if (meta.minimal.length !== 5) throw new Error("meta.insights tối giản phải 5 field");
  if (meta.fields.length !== 68) throw new Error("meta.insights phải 68 field");
  for (const p of PRESET_PROVIDERS) {
    if (!ENTITIES_BY_PROVIDER[p.key]?.length) throw new Error(`thiếu entity cho ${p.key}`);
  }

  // 2) Preset hệ thống
  const sys = listSystemPresets();
  const minimal = sys.filter((p) => p.kind === "minimal");
  const recommended = sys.filter((p) => p.kind === "system");
  console.log("[2] preset hệ thống:", minimal.length, "tối giản +", recommended.length, "đề xuất");
  if (minimal.length !== 14) throw new Error("phải có 14 preset tối giản");
  if (recommended.length !== 13) throw new Error("phải có 13 preset đề xuất");
  const metaRec = recommended.find((p) => p.provider === "meta")!;
  console.log("    Meta đề xuất:", countFields(metaRec.config), "field");

  // 3) normalizeConfig bỏ field/entity lạ
  const cleaned = normalizeConfig("meta", {
    "meta.insights": ["spend", "bogus_field", "spend"],
    "not.an.entity": ["spend"],
  });
  console.log("[3] normalize:", JSON.stringify(cleaned));
  if (cleaned["meta.insights"].length !== 1) throw new Error("phải dedupe + bỏ field lạ");
  if ("not.an.entity" in cleaned) throw new Error("phải bỏ entity lạ");

  // 4) applyFieldPreset — field lồng nhau kiểu Pancake
  const order = {
    data: [{ id: 1, status: "ok", bill_full_name: "A", shipping_address: { full_address: "HN", province_name: "HN2", junk: "x" }, junk: true }],
  };
  const filtered: any = applyFieldPreset(order, ["id", "shipping_address.full_address"]);
  console.log("[4] nested filter:", JSON.stringify(filtered));
  if (!filtered.data[0].shipping_address.full_address) throw new Error("phải giữ field lồng");
  if ("junk" in filtered.data[0].shipping_address) throw new Error("phải cắt field lồng lạ");
  if ("bill_full_name" in filtered.data[0]) throw new Error("phải cắt field top-level lạ");

  // 5) effectiveFields: entity để trống ⇒ tối giản
  const cfg = snapshotConfig("meta", { "meta.insights": ["spend"] });
  const eff = effectiveFields("meta", "meta.campaign_details", cfg);
  console.log("[5] entity trống ⇒", eff?.length, "field tối giản");
  if (!eff || eff.length !== ENTITY_BY_KEY["meta.campaign_details"].minimal.length) throw new Error("fallback tối giản sai");

  // 6) DB: preset tự tạo + key sao chép cấu hình
  const [biz] = await db.select().from(schema.bizs).limit(1);
  if (!biz) throw new Error("Chưa có biz — chạy npm run seed trước");

  const [preset] = await db.insert(schema.fieldPresets).values({
    bizId: biz.id,
    provider: "meta",
    name: "verify-phase19",
    fields: [],
    config: { "meta.insights": ["spend", "clicks", "ctr"] },
    isSystem: false,
  }).returning();
  const loaded = await loadPresetConfig(biz.id, "meta", preset.id);
  console.log("[6] preset DB:", preset.id, "| fields:", countFields(loaded));
  if (!loaded || loaded["meta.insights"].length !== 3) throw new Error("load preset DB sai");

  const raw = `mk_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const [key] = await db.insert(schema.mcpKeys).values({
    bizId: biz.id, name: "verify-phase19", keyHash: sha256(raw), keyPrefix: raw.slice(0, 10),
    scopes: { meta_ads: "read", write: "false" },
    fieldPresets: { meta: preset.id },
    fieldConfig: snapshotConfig("meta", loaded),
  }).returning();
  const keyCfg = key.fieldConfig as Record<string, string[] | string>;
  console.log("[7] key:", key.id, "| meta.insights:", keyCfg["meta.insights"], "| campaign_details:", keyCfg["meta.campaign_details"]);
  if (keyCfg["meta.campaign_details"] !== "toi-gian") throw new Error("entity không chọn phải lưu toi-gian");

  await db.delete(schema.mcpKeys).where(eq(schema.mcpKeys.id, key.id));
  await db.delete(schema.fieldPresets).where(eq(schema.fieldPresets.id, preset.id));
  console.log("[8] đã dọn dữ liệu test:", key.id, preset.id);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

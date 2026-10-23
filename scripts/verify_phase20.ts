// Verify Phase 20: cấu hình bảng Chỉ số quảng cáo + công thức tuỳ chỉnh.
// Chạy khi server local ĐANG TẮT: npx tsx scripts/verify_phase20.ts
import { db, schema } from "../src/db";
import { and, eq } from "drizzle-orm";
import { validateFormula, evalFormula, formatValue } from "../src/lib/formula";
import { AD_COLUMNS, normalizeLayout } from "../src/lib/ad-table";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

async function main() {
  const refs = AD_COLUMNS.map((c) => c.key);

  // 1) Công thức hợp lệ
  const ok = validateFormula("{conversions}*300000/{spend}", refs);
  console.log("[1] hợp lệ:", ok);
  assert(ok.ok, "công thức đúng phải pass");

  // 2) Các trường hợp lỗi
  const cases: [string, string][] = [
    ["{spend}/{unknown}", "chỉ số lạ"],
    ["{spend}$", "ký tự lạ"],
    ["({spend}+{clicks}", "thiếu )"],
    ["{}", "ref rỗng"],
    ["{spend}", ""],
  ];
  for (const [expr, label] of cases) {
    const r = validateFormula(expr, refs);
    console.log(`[2] ${label || "chỉ số đơn"}:`, r.ok ? "ok" : r.error);
  }
  assert(!validateFormula("{spend}/{unknown}", refs).ok, "phải bắt chỉ số lạ");
  assert(!validateFormula("{spend}$", refs).ok, "phải bắt ký tự lạ");
  assert(!validateFormula("({spend}+{clicks}", refs).ok, "phải bắt thiếu ngoặc");
  assert(validateFormula("{spend}", refs).ok, "một chỉ số phải hợp lệ");

  // 3) Tính toán
  const values = { spend: 1_000_000, conversions: 20, impressions: 0 };
  console.log("[3] roas:", evalFormula("{conversions}*300000/{spend}", values));
  assert(evalFormula("{conversions}*300000/{spend}", values) === 6, "ROAS phải bằng 6");
  assert(evalFormula("{spend}/{impressions}", values) === null, "chia 0 phải trả null");
  assert(evalFormula("{spend}", {}) === null, "thiếu dữ liệu phải trả null");
  assert(evalFormula("-({spend}/1000)+2", values) === -998, "dấu âm + ngoặc");

  console.log("[4] format:", formatValue(1000000, "currency"), "|", formatValue(2.5, "percent"), "|", formatValue(1.2345, "decimal", 2));
  assert(formatValue(null, "currency") === "—", "null phải là —");
  assert(formatValue(1000000, "currency").endsWith("₫"), "currency phải có ₫");

  // 5) normalizeLayout
  const layout = normalizeLayout("meta", {
    columns: [{ key: "spend", starred: true }, { key: "bogus" }, { key: "spend" }, { key: "cf_1" }],
    customFields: [{ key: "cf_1", name: "ROAS", formula: "{conversions}*300000/{spend}", format: "decimal", decimals: 2 }],
    mergeAccounts: true,
    defaultLevel: "adset",
  });
  console.log("[5] layout:", JSON.stringify(layout));
  assert(layout.columns[0].key === "name", "cột Tên luôn đầu");
  assert(layout.columns.some((c) => c.key === "spend" && c.starred), "giữ dấu sao");
  assert(!layout.columns.some((c) => c.key === "bogus"), "bỏ cột lạ");
  assert(layout.columns.filter((c) => c.key === "spend").length === 1, "không trùng cột");
  assert(layout.columns.some((c) => c.key === "cf_1"), "giữ cột công thức");
  assert(layout.mergeAccounts === true && layout.defaultLevel === "adset", "giữ tuỳ chọn gộp/cấp");

  const fallback = normalizeLayout("tiktok", { columns: [] });
  console.log("[6] fallback:", fallback.columns.map((c) => c.key).join(","));
  assert(fallback.columns.length > 1, "rỗng phải rơi về mặc định");

  // 7) DB round-trip
  const [biz] = await db.select().from(schema.bizs).limit(1);
  const [user] = await db.select().from(schema.users).limit(1);
  assert(biz && user, "cần seed biz + user");

  await db.insert(schema.adTableLayouts).values({
    bizId: biz.id, userId: user.id, platform: "meta",
    columns: layout.columns, mergeAccounts: true, defaultLevel: "adset",
    customFields: layout.customFields as any, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [schema.adTableLayouts.bizId, schema.adTableLayouts.userId, schema.adTableLayouts.platform],
    set: { columns: layout.columns, mergeAccounts: true, defaultLevel: "adset", customFields: layout.customFields as any },
  });

  const [row] = await db.select().from(schema.adTableLayouts)
    .where(and(eq(schema.adTableLayouts.bizId, biz.id), eq(schema.adTableLayouts.userId, user.id), eq(schema.adTableLayouts.platform, "meta")));
  console.log("[7] DB:", row.columns.length, "cột |", row.customFields.length, "trường | merge =", row.mergeAccounts);
  assert(row.columns.length === layout.columns.length, "đọc lại phải khớp");

  await db.delete(schema.adTableLayouts).where(eq(schema.adTableLayouts.id, row.id));
  console.log("[8] đã dọn dữ liệu test");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

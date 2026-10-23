// Verify hợp đồng Ad Metrics mà không cần HTTP/auth.
// Run (server phải STOP vì PGlite 1 process): npx tsx scripts/verify_ad_metrics.ts
import { db, schema } from "../src/db";
import { eq } from "drizzle-orm";
import { AD_CATALOG, AD_PLATFORMS, MAX_QUERY_ACCOUNTS } from "../src/lib/ad-catalog";
import { loadSources, parseQueryBody, runQuery } from "../src/lib/ad-query";
import { normalizeView, requiredMetrics } from "../src/lib/ad-views";

const ok = (cond: unknown, label: string) => {
  if (!cond) {
    console.error("FAIL:", label);
    process.exitCode = 1;
  } else {
    console.log("ok  :", label);
  }
};

async function main() {
  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.slug, "my-biz")).limit(1);
  if (!biz) throw new Error("Chưa seed my-biz");

  // Catalog
  ok(Object.keys(AD_CATALOG).length === 4, "catalog có 4 nền tảng");
  ok(AD_CATALOG.meta.metrics.length === 13, "meta 13 metric");
  ok(AD_CATALOG.tiktok.metrics.length === 8, "tiktok 8 metric");
  ok(AD_CATALOG.google.metrics.length === 6, "google 6 metric");
  ok(AD_CATALOG.openai_ads.metrics.length === 5, "openai_ads 5 metric");

  // Sources
  const sources = await loadSources(biz.id);
  ok(sources.platforms.length === 4, "sources có 4 nền tảng");
  for (const p of sources.platforms) {
    ok(p.accounts.length > 0, `${p.platform} có tài khoản`);
    for (const a of p.accounts) ok(a.account_key === `${a.credential_id}:${a.account_id}`, `${p.platform} account_key đúng format`);
  }

  // Query từng nền tảng
  for (const platform of AD_PLATFORMS) {
    const src = sources.platforms.find((p) => p.platform === platform);
    if (!src) continue;
    const account = src.accounts[0];
    const metrics = AD_CATALOG[platform].default_columns;
    const body = {
      platform,
      level: "campaign" as const,
      account_keys: [account.account_key],
      range: { preset: "last7" },
      metrics,
      campaign_ids: [],
      adset_ids: [],
      refresh: false,
    };
    const parsed = parseQueryBody(body);
    ok(parsed.ok, `${platform} parse body`);
    if (!parsed.ok) continue;
    const res = await runQuery(biz.id, parsed.body);
    ok(res.rows.length > 0, `${platform} có row`);
    ok(res.totals.by_currency[account.currency] !== undefined, `${platform} totals theo ${account.currency}`);
    const row = res.rows[0];
    ok(typeof row.row_key === "string" && row.row_key.includes(account.account_key), `${platform} row_key ổn định`);
    ok(Object.keys(row.metrics).length === metrics.length, `${platform} đủ metric yêu cầu`);
  }

  // Level adset/ad + merge
  const metaSrc = sources.platforms.find((p) => p.platform === "meta")!;
  const adBody = parseQueryBody({
    platform: "meta",
    level: "ad",
    account_keys: metaSrc.accounts.map((a) => a.account_key),
    range: { preset: "this_month" },
    metrics: AD_CATALOG.meta.default_columns,
    campaign_ids: [],
    adset_ids: [],
    refresh: true,
  });
  ok(adBody.ok, "parse body level ad");
  if (adBody.ok) {
    const res = await runQuery(biz.id, adBody.body);
    ok(res.level === "ad", "trả đúng level ad");
    ok(res.rows.every((r) => r.ad_id), "mọi row có ad_id");
  }

  // Validate lỗi
  const tooMany = parseQueryBody({
    platform: "meta",
    level: "campaign",
    account_keys: Array.from({ length: MAX_QUERY_ACCOUNTS + 1 }, (_, i) => `c:${i}`),
    range: { preset: "last7" },
    metrics: ["spend"],
  });
  ok(!tooMany.ok, "chặn > 30 tài khoản");

  const badMetric = parseQueryBody({
    platform: "meta",
    level: "campaign",
    account_keys: ["c:1"],
    range: { preset: "last7" },
    metrics: ["khong_ton_tai"],
  });
  ok(!badMetric.ok, "chặn metric lạ");

  const badCustom = parseQueryBody({
    platform: "meta",
    level: "campaign",
    account_keys: ["c:1"],
    range: { preset: "last7" },
    metrics: ["spend"],
  });
  ok(badCustom.ok, "body hợp lệ trước khi thử view");

  // View normalization
  const v = normalizeView("meta", {
    columns: Array.from({ length: 90 }, (_, i) => (i < 13 ? AD_CATALOG.meta.metrics[i].key : `x${i}`)),
    highlights: ["spend", "khong_co"],
    merge_accounts: false,
    default_level: "ad",
    custom_fields: [
      { key: "cf_roi", name: "ROI", formula: "{action_values_purchase}/{spend}", format: "decimal", decimals: 2 },
      { key: "bad-key", name: "X", formula: "{spend}", format: "decimal", decimals: 2 },
    ],
  });
  ok(v.columns.length <= 13, "view cắt cột lạ");
  ok(v.highlights.length === 1 && v.highlights[0] === "spend", "view lọc highlight");
  ok(v.default_level === "ad", "view giữ level hợp lệ");
  ok(v.custom_fields.length === 1, "view bỏ custom field sai key");
  ok(requiredMetrics("meta", v).includes("action_values_purchase"), "requiredMetrics gom ref của công thức");

  console.log("\nXong verify_ad_metrics");
}

main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

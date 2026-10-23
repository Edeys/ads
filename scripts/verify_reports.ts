// Kiểm tra các truy vấn Báo cáo (shape "group" giống API gốc) trên PGlite.
// Chạy khi server đã dừng: npx tsx scripts/verify_reports.ts
import { db, schema } from "../src/db";
import { resolveRange } from "../src/lib/reports";
import { getBizGroups, getLlmUsageV2, getOverviewV2 } from "../src/lib/report-groups";

const EXPECTED_GROUPS = [
  "post_triggers",
  "autopilot",
  "sync",
  "budget",
  "templates",
  "connections",
  "mcp",
  "team",
  "billing",
  "support",
  "audit",
];

const EXPECTED_OVERVIEW = [
  "range_days",
  "from_at",
  "to_at",
  "preset",
  "prev_from_at",
  "prev_to_at",
  "timezone",
  "summary",
  "config_health",
  "post_trigger",
  "connections",
  "mcp",
  "quota",
];

const ok = (cond: unknown, label: string) => {
  if (!cond) {
    console.error("FAIL:", label);
    process.exitCode = 1;
  } else {
    console.log("ok  :", label);
  }
};

async function main() {
  const [biz] = await db.select().from(schema.bizs).limit(1);
  if (!biz) {
    console.log("Chưa có biz nào.");
    return;
  }

  for (const preset of ["today", "last7", "this_month", "last_month", "this_year"]) {
    const range = resolveRange(preset);
    const [overview, report, llm] = await Promise.all([
      getOverviewV2(biz.id, range),
      getBizGroups(biz.id, range),
      getLlmUsageV2(biz.id, range),
    ]);

    console.log(`\n== ${preset} (${range.label})`);
    ok(EXPECTED_OVERVIEW.every((k) => k in overview), `${preset}: overview đủ ${EXPECTED_OVERVIEW.length} key`);
    ok(report.groups.length === 11, `${preset}: biz có 11 group`);
    ok(
      EXPECTED_GROUPS.every((k, i) => report.groups[i]?.key === k),
      `${preset}: thứ tự group đúng`,
    );
    ok(report.headline.length === 2, `${preset}: headline 2 mục`);
    ok(report.headline[0].key === "events" && report.headline[1].key === "errors", `${preset}: headline key đúng`);
    ok(report.buckets.length > 0, `${preset}: có buckets (${report.buckets.length})`);
    ok(llm.totals.calls === llm.by_model.reduce((a, m) => a + m.calls, 0), `${preset}: llm totals khớp by_model`);

    for (const g of report.groups) {
      const badTable = g.tables.find((t) => t.rows.some((r) => r.length !== t.columns.length));
      ok(!badTable, `${preset}: ${g.key} table rows khớp số cột`);
    }

    const nonEmpty = report.groups.filter(
      (g) =>
        g.metrics.some((m) => m.value || m.text) ||
        g.snapshot.some((m) => m.value || m.text) ||
        g.tables.some((t) => t.rows.length),
    );
    console.log(
      `   groups: ${nonEmpty.length}/11 có dữ liệu · headline events=${report.headline[0].value} errors=${report.headline[1].value} · ${report.elapsed_ms} ms`,
    );
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

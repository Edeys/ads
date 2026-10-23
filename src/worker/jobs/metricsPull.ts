import type { schema } from "../../db";
import { metaToken, metaInsights } from "../../lib/meta-ads";
import { tiktokToken, tiktokGetInsights } from "../../lib/tiktok-ads";
import { googleAdsToken, googleAdsInsights } from "../../lib/google-ads";
import { sheetsToken, sheetAppend, sheetUpsert, sheetGetValues, sheetUpdate } from "../../lib/sheets";
import { webhookPost } from "../../lib/notify";
import { FIXED_METRICS, METRICS_BY_PROVIDER, type MetricDef } from "../../lib/metrics-catalog";

// Kéo chỉ số → Google Sheets.
// params: { adAccountId, sheetsConnId, sheetId, sheetTab, writeMode, dateRange:{from,to}, metrics[], webhookId?, pageWhitelistIds[] }
export async function runMetricsPull(cfg: typeof schema.configs.$inferSelect) {
  const p = cfg.params as any;
  if (!cfg.credentialId) throw new Error("Config thiếu credential");
  if (!p.sheetsConnId || !p.sheetId) throw new Error("Thiếu Google Sheet đích");

  const selected: MetricDef[] = (p.metrics ?? [])
    .map((id: string) => (METRICS_BY_PROVIDER[cfg.provider] ?? []).find((m) => m.id === id))
    .filter(Boolean);
  const defs = [...FIXED_METRICS, ...selected];
  const header = defs.map((d) => d.label);

  // 1. Kéo insights từ provider
  let rows: (string | number)[][] = [];
  if (cfg.provider === "facebook") {
    const token = await metaToken(cfg.credentialId);
    const data = await metaInsights({
      token,
      adAccountId: p.adAccountId,
      level: "ad",
      since: p.dateRange?.from,
      until: p.dateRange?.to,
      extraMetrics: selected,
    });
    rows = data.map((r) => defs.map((d) => r[d.id] ?? ""));
  } else if (cfg.provider === "tiktok") {
    const token = await tiktokToken(cfg.credentialId);
    const data = await tiktokGetInsights({
      token,
      advertiserId: p.adAccountId,
      startDate: p.dateRange?.from ?? new Date(Date.now() - 7 * 86400e3).toISOString().split("T")[0],
      endDate: p.dateRange?.to ?? new Date().toISOString().split("T")[0],
      extraMetrics: selected,
    });
    rows = data.map((r: any) => defs.map((d) => r[d.id] ?? ""));
  } else if (cfg.provider === "google") {
    const token = await googleAdsToken(cfg.credentialId);
    const data = await googleAdsInsights({
      token,
      customerId: p.adAccountId,
      startDate: p.dateRange?.from,
      endDate: p.dateRange?.to,
    });
    rows = data.map((r: any) => defs.map((d) => r[d.id] ?? ""));
  } else {
    return { skipped: `provider ${cfg.provider} chưa hỗ trợ`, configId: cfg.id };
  }

  // 2. Ghi vào Sheets
  const tab = p.sheetTab || "Sheet1";
  const token = await sheetsToken(p.sheetsConnId);
  let result: Record<string, number>;
  if (p.writeMode === "append") {
    const existingHeaderOk = await ensureHeader(token, p.sheetId, tab, header);
    void existingHeaderOk;
    await sheetAppend(token, p.sheetId, `${tab}!A1`, rows);
    result = { appended: rows.length, updated: 0 };
  } else {
    const keyCol = defs.findIndex((d) => d.id === "ad_id" || d.id === "campaign_id");
    const res = await sheetUpsert({
      token, sheetId: p.sheetId, tab, header, keyCol: Math.max(keyCol, 0),
      rows, keyOf: (row) => String(row[Math.max(keyCol, 0)] ?? ""),
    });
    result = res;
  }

  // 3. Webhook notify
  if (p.webhookId) {
    await webhookPost(p.webhookId, {
      event: "metrics_pull.done", configId: cfg.id, name: cfg.name,
      rows: rows.length, ...result, at: new Date().toISOString(),
    });
  }

  return { rows: rows.length, ...result };
}

async function ensureHeader(token: string, sheetId: string, tab: string, header: string[]) {
  const existing = await sheetGetValues(token, sheetId, `${tab}!A1:A1`);
  if (!existing.length) {
    await sheetUpdate(token, sheetId, `${tab}!A1`, [header]);
    return false;
  }
  return true;
}

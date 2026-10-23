// Meta Marketing API helpers — dùng chung cho worker jobs + MCP tools.
import { db } from "@/db";
import { fetchT } from "./http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "./crypto";
import type { MetricDef } from "./metrics-catalog";
import { FIXED_METRICS } from "./metrics-catalog";
import { assertRealWrites } from "./write-guard";

const GRAPH = "https://graph.facebook.com/v21.0";

export async function metaToken(credentialId: string) {
  const [conn] = await db.select().from(connections).where(eq(connections.id, credentialId)).limit(1);
  if (!conn || conn.provider !== "meta_ads") throw new Error("Meta credential không tồn tại");
  return decryptSecret((conn.secret as any).enc).access_token as string;
}

// Kéo insights level=ad (đủ campaign/adset/ad ids) — paging đầy đủ.
export async function metaInsights(opts: {
  token: string;
  adAccountId: string;
  level?: "campaign" | "adset" | "ad";
  since?: string; until?: string;
  extraMetrics?: MetricDef[];
  limit?: number;
}) {
  const { token, adAccountId, since, until } = opts;
  const level = opts.level ?? "ad";
  const extra = opts.extraMetrics ?? [];

  // top-level fields: 18 cố định (bỏ action-type) + extra không phải action
  const actionBased = new Set(extra.filter((m) => m.action).map((m) => m.id));
  const fields = [...FIXED_METRICS.filter((m) => !m.action).map((m) => m.api ?? m.id),
    ...extra.filter((m) => !m.action).map((m) => m.api ?? m.id)]
    .filter((f) => f !== "effective_status")
    .filter((f, i, a) => a.indexOf(f) === i);
  // action metrics đi qua fields=actions,action_values,cost_per_action_type,purchase_roas,website_purchase_roas
  if (extra.some((m) => m.action)) fields.push("actions", "action_values", "cost_per_action_type", "purchase_roas", "website_purchase_roas");

  const params = new URLSearchParams({
    access_token: token, level, fields: fields.join(","), limit: String(opts.limit ?? 500),
  });
  if (since && until) params.set("time_range", JSON.stringify({ since, until }));
  else params.set("date_preset", "last_7d");

  const rows: any[] = [];
  let url: string | null = `${GRAPH}/${adAccountId}/insights?${params}`;
  while (url) {
    const res: Response = await fetchT(url);
    const j: any = await res.json();
    if (j.error) throw new Error(`Meta: ${j.error.message}`);
    rows.push(...(j.data ?? []));
    url = j.paging?.next ?? null;
  }

  // Flatten: map theo FIXED + extra defs -> row phẳng cho sheet
  const defs = [...FIXED_METRICS, ...extra];
  const statusById = defs.some((d) => d.id === "status")
    ? await metaStatusMap(token, adAccountId, level)
    : new Map<string, string>();
  return rows.map((r) => {
    const flat = flattenRow(r, defs);
    if (statusById.size) flat.status = statusById.get(String(r[`${level}_id`] ?? "")) ?? "";
    return flat;
  });
}

function flattenRow(r: any, defs: MetricDef[]) {
  const out: Record<string, string | number> = {};
  const actions: any[] = r.actions ?? [];
  const values: any[] = r.action_values ?? [];
  const costs: any[] = r.cost_per_action_type ?? [];
  for (const d of defs) {
    if (d.action) {
      const src = d.api === "action_values" ? values : d.api === "cost_per_action_type" ? costs : actions;
      const hit = src.find((a) => a.action_type === d.action);
      out[d.id] = hit ? Number(hit.value) : 0;
    } else {
      out[d.id] = r[d.api ?? d.id] ?? "";
    }
  }
  return out;
}

/**
 * Meta Insights KHÔNG trả `effective_status` (v21 báo lỗi field không hợp lệ).
 * Lấy trạng thái từ edge tương ứng rồi ghép vào dòng insights.
 */
export async function metaStatusMap(
  token: string,
  adAccountId: string,
  level: "campaign" | "adset" | "ad",
): Promise<Map<string, string>> {
  const edge = level === "campaign" ? "campaigns" : level === "adset" ? "adsets" : "ads";
  const map = new Map<string, string>();
  let url: string | null =
    `${GRAPH}/${adAccountId}/${edge}?fields=id,effective_status&limit=500&access_token=${encodeURIComponent(token)}`;
  let guard = 0;
  while (url && guard++ < 20) {
    const res: Response = await fetchT(url);
    const j: any = await res.json();
    if (j.error) throw new Error(`Meta: ${j.error.message}`);
    for (const row of j.data ?? []) map.set(String(row.id), String(row.effective_status ?? "UNKNOWN"));
    url = j.paging?.next ?? null;
  }
  return map;
}

// ---------- Write helpers (autopilot / quick ads) ----------
export async function metaSetStatus(token: string, id: string, status: "ACTIVE" | "PAUSED") {
  assertRealWrites(`Meta đổi trạng thái ${id} → ${status}`);
  const res = await fetchT(`${GRAPH}/${id}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, status }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

export async function metaSetBudget(token: string, id: string, dailyBudget: number) {
  assertRealWrites(`Meta đổi ngân sách ${id}`);
  const res = await fetchT(`${GRAPH}/${id}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: token, daily_budget: String(Math.round(dailyBudget)) }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

export async function metaGet(token: string, id: string, fields: string) {
  const res = await fetchT(`${GRAPH}/${id}?fields=${fields}&access_token=${token}`);
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

export async function metaCloneCampaign(token: string, campaignId: string, opts: { name?: string; dailyBudget?: number } = {}) {
  assertRealWrites(`Meta nhân bản campaign ${campaignId}`);
  const body = new URLSearchParams({ access_token: token, deep_copy: "false", status_option: "PAUSED" });
  if (opts.name) body.set("rename_options", JSON.stringify({ rename_suffix: ` ${opts.name}` }));
  if (opts.dailyBudget) body.set("daily_budget", String(Math.round(opts.dailyBudget)));
  const res = await fetchT(`${GRAPH}/${campaignId}/copies`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

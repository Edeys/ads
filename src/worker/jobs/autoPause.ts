import type { schema } from "../../db";
import { fetchT } from "../../lib/http";
import { db } from "../../db";
import { cpaThresholds, autopilotActions, connections } from "../../db/schema";
import { eq } from "drizzle-orm";
import { metaToken, metaSetStatus, metaCloneCampaign, metaStatusMap } from "../../lib/meta-ads";
import { telegramSend } from "../../lib/notify";
import { aiChat } from "../../lib/ai";

const GRAPH = "https://graph.facebook.com/v21.0";

// Ads Autopilot — 3 zone theo spec:
//   chưa đủ data (spend < minDataPct% × target, 0 conversion) → bỏ qua
//   target → maxPct% × target → AI quyết (trend + đơn QLBH)
//   > maxPct% × target → tắt ngay
// Whitelist page: ad có page_id ngoài whitelist → tắt luôn (kể cả protected).
// params: { adAccountId, level, thresholdId, protectedCampaignIds[], telegramConnId, aiConnId, qlbhConnId?, autoRecreate?, pageWhitelistConnId? }
export async function runAutoPause(cfg: typeof schema.configs.$inferSelect) {
  const p = cfg.params as any;
  if (!cfg.credentialId) throw new Error("Config thiếu credential");
  const [threshold] = await db.select().from(cpaThresholds).where(eq(cpaThresholds.id, p.thresholdId)).limit(1);
  if (!threshold) throw new Error("Thiếu ngưỡng CPA");
  const token = await metaToken(cfg.credentialId);
  const level: "campaign" | "adset" | "ad" = p.level ?? "campaign";
  const protectedIds = new Set<string>(p.protectedCampaignIds ?? []);
  const log = (a: { targetType: string; targetId: string; action: string; cpa?: number; reason?: string; aiIn?: number; aiOut?: number }) =>
    db.insert(autopilotActions).values({
      configId: cfg.id, targetType: a.targetType, targetId: a.targetId, action: a.action,
      cpa: a.cpa ?? null, reason: a.reason ?? null, aiTokensIn: a.aiIn ?? null, aiTokensOut: a.aiOut ?? null,
    }).catch((e) => console.error("[autopilot] log failed", e));

  let checked = 0, actions = 0;
  const notify = async (text: string) => {
    if (p.telegramConnId) await telegramSend(p.telegramConnId, `[Autopilot] ${cfg.name}\n${text}`).catch(() => {});
  };

  // ---- Pass B trước: whitelist page ở ad level (tắt luôn, kể cả protected) ----
  if (p.pageWhitelistConnId) {
    const [wl] = await db.select().from(connections).where(eq(connections.id, p.pageWhitelistConnId)).limit(1);
    const allowed = new Set(String((wl?.meta as any)?.page_ids ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    if (allowed.size) {
      const rows = await fetchInsights(token, p.adAccountId, "ad");
      for (const r of rows) {
        if (r.effective_status !== "ACTIVE") continue;
        const pageId = pageIdOf(r);
        if (pageId && !allowed.has(pageId)) {
          try {
            await metaSetStatus(token, r.ad_id, "PAUSED");
          } catch (e) {
            console.error("[autopilot] không tắt được ad (write guard)", e);
            continue;
          }
          await log({ targetType: "ad", targetId: r.ad_id, action: "paused_whitelist", reason: `page ${pageId} ngoài whitelist` });
          await notify(`⛔ tắt ad "${r.ad_name}" — page ngoài whitelist`);
          actions++;
        }
      }
    }
  }

  // ---- Pass A: CPA zones ở level cấu hình ----
  const rows = await fetchInsights(token, p.adAccountId, level);
  for (const r of rows) {
    const statusKey = `${level}_effective_status`;
    const target = pickTarget(r.objective, threshold.limits as any);
    if (!target) continue; // không map được nhóm ngưỡng
    const conv = conversionsOf(r, threshold.limits as any);
    const spend = Number(r.spend ?? 0);
    const id = r[`${level}_id`], name = r[`${level}_name`] ?? id;
    const status = r[statusKey] ?? r.effective_status;
    if (status !== "ACTIVE") continue;
    checked++;

    const targetVnd = target.vnd;
    const cpa = conv > 0 ? Math.round(spend / conv) : Infinity;

    // Chưa đủ data: chưa có conversion và spend chưa tới minDataPct% × target
    if (conv === 0 && spend < (targetVnd * threshold.minDataPct) / 100) continue;
    // Trong mục tiêu
    if (conv > 0 && cpa <= targetVnd) continue;

    // Vượt ngưỡng — protected trước
    if (level === "campaign" && protectedIds.has(id)) {
      await log({ targetType: "campaign", targetId: id, action: "protected_skipped", cpa: finite(cpa), reason: `CPA ${fmt(cpa)}₫ vượt nhưng được bảo vệ` });
      await notify(`🛡 "${name}" CPA ${fmt(cpa)}₫ vượt ngưỡng ${fmt(targetVnd)}₫ — được bảo vệ, không tắt`);
      continue;
    }

    // Max zone → tắt ngay
    if (cpa > (targetVnd * threshold.maxPct) / 100) {
      await metaSetStatus(token, id, "PAUSED");
      await log({ targetType: level, targetId: id, action: "paused", cpa: finite(cpa), reason: `CPA ${fmt(cpa)}₫ > ${threshold.maxPct}% × ${fmt(targetVnd)}₫` });
      await notify(`⛔ tắt ${levelLabel(level)} "${name}" — CPA ${fmt(cpa)}₫ vượt ${threshold.maxPct}% ngưỡng ${fmt(targetVnd)}₫`);
      actions++;
      if (level === "campaign" && p.autoRecreate?.enabled) {
        const clone = await metaCloneCampaign(token, id, { name: "auto-recreate", dailyBudget: p.autoRecreate.budget }).catch((e) => ({ error: e.message }));
        await log({ targetType: "campaign", targetId: id, action: "recreated", reason: `clone → ${(clone as any).id ?? (clone as any).error}` });
        await notify(`♻️ đã clone "${name}" với ngân sách ${(p.autoRecreate.budget ?? 0).toLocaleString("vi-VN")}₫/ngày (paused, chờ duyệt)`);
      }
      continue;
    }

    // Vùng lưng chừng → AI quyết
    let decision = "keep", reason = "AI không trả lời được — giữ nguyên";
    let aiIn: number | undefined, aiOut: number | undefined;
    if (p.aiConnId) {
      try {
        const ai = await aiChat({
          connId: p.aiConnId, bizId: cfg.bizId, purpose: "cpa_analysis",
          system: "Bạn là chuyên gia tối ưu ads. Trả lời ĐÚNG JSON: {\"decision\":\"pause\"|\"keep\",\"reason\":\"...\"}. Không giải thích thêm.",
          user: `${levelLabel(level)} "${name}": spend ${Math.round(spend).toLocaleString("vi-VN")}₫, ${conv} conversion (nhóm ${target.group}), CPA ${fmt(cpa)}₫ vs mục tiêu ${fmt(targetVnd)}₫ (vùng AI: ${fmt(targetVnd)}₫–${fmt((targetVnd * threshold.maxPct) / 100)}₫). Nên tắt hay giữ?`,
        });
        aiIn = ai.tokensIn; aiOut = ai.tokensOut;
        const m = ai.text.match(/\{[^}]*\}/);
        if (m) {
          const j = JSON.parse(m[0]);
          decision = j.decision === "pause" ? "pause" : "keep";
          reason = j.reason ?? reason;
        }
      } catch (e: any) {
        reason = `AI lỗi: ${e.message}`;
      }
    }

    if (decision === "pause") {
      await metaSetStatus(token, id, "PAUSED");
      await log({ targetType: level, targetId: id, action: "paused", cpa: finite(cpa), reason: `AI: ${reason}`, aiIn, aiOut });
      await notify(`🤖 AI tắt ${levelLabel(level)} "${name}" — CPA ${fmt(cpa)}₫. ${reason}`);
      actions++;
    } else {
      await log({ targetType: level, targetId: id, action: "kept_by_ai", cpa: finite(cpa), reason, aiIn, aiOut });
      await notify(`🤖 AI giữ ${levelLabel(level)} "${name}" — CPA ${fmt(cpa)}₫. ${reason}`);
    }
  }

  return { checked, actions };
}

// ---------- helpers ----------
async function fetchInsights(token: string, adAccountId: string, level: string) {
  const params = new URLSearchParams({
    access_token: token, level, limit: "500", date_preset: "last_7d",
    fields: `${level}_id,${level}_name,${level === "campaign" ? "objective" : "campaign_id,objective"},spend,actions${level === "ad" ? ",adcreatives{page_id}" : ""}`,
  });
  const statusById = await metaStatusMap(token, adAccountId, level as "campaign" | "adset" | "ad");
  const rows: any[] = [];
  let url: string | null = `${GRAPH}/${adAccountId}/insights?${params}`;
  while (url) {
    const res: Response = await fetchT(url);
    const j: any = await res.json();
    if (j.error) throw new Error(`Meta: ${j.error.message}`);
    for (const row of j.data ?? []) {
      const status = statusById.get(String(row[`${level}_id`] ?? "")) ?? "UNKNOWN";
      row[`${level}_effective_status`] = status;
      row.effective_status = status;
    }
    rows.push(...(j.data ?? []));
    url = j.paging?.next ?? null;
  }
  return rows;
}

function pageIdOf(r: any): string | null {
  const c = r.adcreatives?.data?.[0] ?? r.adcreatives;
  return c?.page_id ?? c?.object_story_spec?.page_id ?? null;
}

const ACTION_FOR: Record<string, { conv: string[]; group: string; limitKey: string }> = {
  replies: { conv: ["messaging_conversation_started_7d", "onsite_conversion.messaging_first_reply"], group: "replies", limitKey: "perMessage" },
  offsite: { conv: ["offsite_conversion.fb_pixel_purchase", "offsite_conversion.fb_pixel_complete_registration"], group: "offsite_conversions", limitKey: "perPurchase" },
  lead: { conv: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"], group: "lead_generation", limitKey: "perLead" },
};

function objectiveGroup(objective: string | undefined): string {
  const o = (objective ?? "").toUpperCase();
  if (o.includes("MESSAGE") || o.includes("ENGAGEMENT") || o.includes("REPLIES")) return "replies";
  if (o.includes("LEAD")) return "lead";
  return "offsite"; // SALES/CONVERSIONS mặc định
}

function pickTarget(objective: string | undefined, limits: any): { vnd: number; group: string } | null {
  const g = objectiveGroup(objective);
  const order = [g, "offsite", "replies", "lead"].filter((v, i, a) => a.indexOf(v) === i);
  for (const grp of order) {
    const lim = limits?.[ACTION_FOR[grp].group];
    if (!lim) continue;
    const v = lim[ACTION_FOR[grp].limitKey] ?? Object.values(lim).find((x) => typeof x === "number" && x > 0);
    if (v) return { vnd: v as number, group: grp };
  }
  return null;
}

function conversionsOf(r: any, limits: any): number {
  const g = objectiveGroup(r.objective);
  const acts: any[] = r.actions ?? [];
  const count = (types: string[]) => acts.filter((a) => types.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
  // nhóm theo objective trước, fallback sang nhóm nào có data
  for (const grp of [g, "offsite", "replies", "lead"]) {
    const n = count(ACTION_FOR[grp].conv);
    if (n > 0) return n;
  }
  return 0;
}

const levelLabel = (l: string) => (l === "campaign" ? "chiến dịch" : l === "adset" ? "nhóm QC" : "quảng cáo");
const fmt = (v: number) => (v === Infinity ? "∞" : Math.round(v).toLocaleString("vi-VN"));
const finite = (v: number) => (v === Infinity ? null : Math.round(v)) as unknown as number;

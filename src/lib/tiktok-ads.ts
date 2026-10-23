// TikTok Marketing API helpers
import { db } from "@/db";
import { fetchT } from "./http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "./crypto";
import type { MetricDef } from "./metrics-catalog";
import { TIKTOK_METRICS } from "./metrics-catalog";
import { assertRealWrites } from "./write-guard";

const TIKTOK_API = "https://business-api.tiktok.com/open_api/v1.3";

export async function tiktokToken(credentialId: string) {
  const [conn] = await db.select().from(connections).where(eq(connections.id, credentialId)).limit(1);
  if (!conn || conn.provider !== "tiktok_ads") throw new Error("TikTok credential không tồn tại");
  const s = decryptSecret((conn.secret as any).enc);
  const token = String(s.access_token ?? "");
  const expireAt = s.access_token_expire_at ? Date.parse(String(s.access_token_expire_at)) : 0;
  const needsRefresh = Boolean(s.refresh_token) && expireAt > 0 && expireAt - Date.now() < 5 * 60_000;
  if (!needsRefresh) return token;

  const appId = process.env.TIKTOK_APP_ID;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appId || !appSecret) return token;

  try {
    const res = await fetchT(`${TIKTOK_API}/oauth2/refresh_token/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        app_id: appId,
        secret: appSecret,
        refresh_token: s.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const j: any = await res.json().catch(() => ({}));
    if (j.code !== 0 || !j.data?.access_token) return token;
    const accessExpiresIn = Number(j.data.access_token_expire_in ?? j.data.expires_in ?? 0);
    const next = {
      ...s,
      access_token: String(j.data.access_token),
      refresh_token: String(j.data.refresh_token ?? s.refresh_token),
      access_token_expire_at:
        accessExpiresIn > 0 ? new Date(Date.now() + accessExpiresIn * 1000).toISOString() : "",
      refresh_token_expire_at: String(s.refresh_token_expire_at ?? ""),
    };
    await db
      .update(connections)
      .set({ secret: { enc: encryptSecret(next) } })
      .where(eq(connections.id, conn.id))
      .catch(() => {});
    return next.access_token;
  } catch {
    return token;
  }
}

export async function tiktokGetInsights(opts: {
  token: string;
  advertiserId: string;
  startDate: string;
  endDate: string;
  extraMetrics?: MetricDef[];
}) {
  const { token, advertiserId, startDate, endDate, extraMetrics = [] } = opts;
  const metrics = ["spend", "impressions", "clicks", "conversion", "cpc", "cpm", "ctr", ...extraMetrics.map((m) => m.id)];

  const res = await fetchT(
    `${TIKTOK_API}/report/integrated/get/?advertiser_id=${advertiserId}&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=["campaign_id","stat_time_day"]&metrics=${JSON.stringify(
      metrics
    )}&start_date=${startDate}&end_date=${endDate}&page=1&page_size=100`,
    {
      headers: { "Access-Token": token },
    }
  );

  const j = await res.json().catch(() => ({}));
  if (j.code !== 0) throw new Error(`TikTok: ${j.message ?? "Lỗi gọi API"}`);

  return (j.data?.list ?? []).map((item: any) => {
    const dim = item.dimensions ?? {};
    const met = item.metrics ?? {};
    return {
      date_start: dim.stat_time_day ?? "",
      campaign_id: dim.campaign_id ?? "",
      campaign_name: dim.campaign_name ?? "",
      spend: Number(met.spend || 0),
      impressions: Number(met.impressions || 0),
      clicks: Number(met.clicks || 0),
      ctr: Number(met.ctr || 0),
      cpc: Number(met.cpc || 0),
      ...met,
    };
  });
}

export async function tiktokSetStatus(token: string, advertiserId: string, campaignId: string, status: "ENABLE" | "DISABLE") {
  assertRealWrites(`TikTok đổi trạng thái campaign ${campaignId} → ${status}`);
  const res = await fetchT(`${TIKTOK_API}/campaign/status/update/`, {
    method: "POST",
    headers: { "Access-Token": token, "content-type": "application/json" },
    body: JSON.stringify({
      advertiser_id: advertiserId,
      campaign_ids: [campaignId],
      opt_status: status,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.code !== 0) throw new Error(`TikTok: ${j.message ?? "Không thể cập nhật trạng thái"}`);
  return j.data;
}

export async function tiktokGetGmvMaxStores(token: string, advertiserId: string) {
  const res = await fetchT(`${TIKTOK_API}/store/list/?advertiser_id=${advertiserId}`, {
    headers: { "Access-Token": token },
  });
  const j = await res.json().catch(() => ({}));
  return j.data?.list ?? [];
}

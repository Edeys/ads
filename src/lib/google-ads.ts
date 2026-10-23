// Google Ads API helpers (GAQL search & status updates)
import { db } from "@/db";
import { fetchT } from "./http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "./crypto";
import { googleServiceAccountToken } from "./providers";
import { assertRealWrites } from "./write-guard";

const GOOGLE_ADS_API = "https://googleads.googleapis.com/v25";

export type GoogleAdsAuth = {
  token: string;
  developerToken: string | null;
  /** MCC id (login customer) — bắt buộc khi truy vấn tài khoản con. */
  loginCustomerId: string | null;
};

/**
 * Lấy access token + developer token + login customer id từ connection.
 *
 * Token Google chỉ sống 1 giờ nên phải refresh bằng refresh_token. Trước đây
 * client_id/client_secret không được lưu vào connection nên nhánh refresh
 * không bao giờ chạy — mọi lệnh Ads sau 1 giờ đều fail với 401.
 */
export async function googleAdsAuth(credentialId: string): Promise<GoogleAdsAuth> {
  const [conn] = await db.select().from(connections).where(eq(connections.id, credentialId)).limit(1);
  if (!conn || conn.provider !== "google_ads") throw new Error("Google Ads credential không tồn tại");
  const s = decryptSecret((conn.secret as any).enc);
  const meta = (conn.meta ?? {}) as Record<string, unknown>;

  let token = s.access_token as string;

  if (s.refresh_token && s.client_id && s.client_secret) {
    const res = await fetchT("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: s.client_id,
        client_secret: s.client_secret,
        refresh_token: s.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.access_token) {
      token = j.access_token as string;
      // Ghi lại token mới để lần sau khỏi refresh.
      await db.update(connections).set({
        secret: { enc: (await import("./crypto")).encryptSecret({ ...s, access_token: token }) },
      }).where(eq(connections.id, conn.id)).catch(() => {});
    }
  }

  const developerToken = s.developer_token || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || null;
  const loginCustomerId = (meta.loginCustomerId as string) || (meta.login_customer_id as string) || null;

  return { token, developerToken, loginCustomerId };
}

export async function googleAdsToken(credentialId: string) {
  return (await googleAdsAuth(credentialId)).token;
}

function adsHeaders(auth: GoogleAdsAuth, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "content-type": "application/json",
    ...extra,
  };
  if (auth.developerToken) headers["developer-token"] = auth.developerToken;
  // Không có login-customer-id thì các truy vấn tới tài khoản con của MCC fail.
  if (auth.loginCustomerId) headers["login-customer-id"] = auth.loginCustomerId.replace(/-/g, "");
  return headers;
}

export async function googleAdsInsights(opts: {
  token?: string;
  developerToken?: string;
  loginCustomerId?: string;
  customerId: string;
  startDate?: string;
  endDate?: string;
}) {
  const auth: GoogleAdsAuth = {
    token: opts.token ?? "",
    developerToken: opts.developerToken ?? null,
    loginCustomerId: opts.loginCustomerId ?? null,
  };
  const dateClause = opts.startDate && opts.endDate
    ? `segments.date BETWEEN '${opts.startDate}' AND '${opts.endDate}'`
    : "segments.date DURING LAST_7_DAYS";
  const query = `
    SELECT
      segments.date,
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.average_cpc,
      metrics.conversions
    FROM campaign
    WHERE ${dateClause}
    ORDER BY segments.date DESC
  `;

  const res = await fetchT(`${GOOGLE_ADS_API}/customers/${opts.customerId.replace(/-/g, "")}/googleAds:search`, {
    method: "POST",
    headers: adsHeaders(auth),
    body: JSON.stringify({ query }),
  });

  const j = await res.json().catch(() => ({}));
  if (j.error) throw new Error(`Google Ads: ${j.error.message}`);

  return (j.results ?? []).map((r: any) => ({
    date_start: r.segments?.date ?? "",
    campaign_id: r.campaign?.id ?? "",
    campaign_name: r.campaign?.name ?? "",
    status: r.campaign?.status ?? "",
    spend: Math.round((Number(r.metrics?.costMicros || 0) / 1_000_000) * 25000), // convert micros to VND approx if needed
    impressions: Number(r.metrics?.impressions || 0),
    clicks: Number(r.metrics?.clicks || 0),
    ctr: Number(r.metrics?.ctr || 0),
    cpc: Number(r.metrics?.averageCpc || 0),
    conversions: Number(r.metrics?.conversions || 0),
  }));
}

export async function googleAdsSetStatus(opts: {
  token?: string;
  developerToken?: string;
  loginCustomerId?: string;
  customerId: string;
  campaignId: string;
  status: "ENABLED" | "PAUSED";
}) {
  assertRealWrites(`Google Ads đổi trạng thái campaign ${opts.campaignId} → ${opts.status}`);
  const auth: GoogleAdsAuth = {
    token: opts.token ?? "",
    developerToken: opts.developerToken ?? null,
    loginCustomerId: opts.loginCustomerId ?? null,
  };
  const res = await fetchT(`${GOOGLE_ADS_API}/customers/${opts.customerId.replace(/-/g, "")}/campaigns:mutate`, {
    method: "POST",
    headers: adsHeaders(auth),
    body: JSON.stringify({
      operations: [
        {
          update: {
            resourceName: `customers/${opts.customerId.replace(/-/g, "")}/campaigns/${opts.campaignId}`,
            status: opts.status,
          },
          updateMask: "status",
        },
      ],
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.error) throw new Error(`Google Ads: ${j.error.message}`);
  return j;
}

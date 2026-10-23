// Google Ads tools cho MCP.
//
// Mỗi tool đều nhận credential_id (id connection) thay vì token thô, để hệ
// thống tự refresh token và tự gắn developer-token + login-customer-id.
import { db } from "@/db";
import { fetchT } from "../../lib/http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { googleAdsAuth } from "@/lib/google-ads";

const API = "https://googleads.googleapis.com/v25";

type Auth = { token: string; developerToken: string | null; loginCustomerId: string | null };

function headers(auth: Auth): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${auth.token}`,
    "content-type": "application/json",
  };
  if (auth.developerToken) h["developer-token"] = auth.developerToken;
  if (auth.loginCustomerId) h["login-customer-id"] = auth.loginCustomerId.replace(/-/g, "");
  return h;
}

async function gaql(auth: Auth, customerId: string, query: string): Promise<any[]> {
  const res = await fetchT(`${API}/customers/${customerId.replace(/-/g, "")}/googleAds:search`, {
    method: "POST",
    headers: headers(auth),
    body: JSON.stringify({ query }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.error) throw new Error(`Google Ads: ${j.error.message}`);
  return j.results ?? [];
}

/** Danh sách tài khoản quảng cáo mà token có quyền truy cập. */
export async function googleAdsGetAccounts(credentialId: string) {
  const auth = await googleAdsAuth(credentialId);
  if (!auth.developerToken) {
    throw new Error(
      "Chưa có Google Ads Developer Token nên không đọc được tài khoản quảng cáo. " +
      "Thêm token ở Cài đặt → Ứng dụng OAuth rồi kết nối lại.",
    );
  }
  const res = await fetchT(`${API}/customers:listAccessibleCustomers`, { headers: headers(auth) });
  const j = await res.json().catch(() => ({}));
  if (j.error) throw new Error(`Google Ads: ${j.error.message}`);
  const ids: string[] = (j.resourceNames ?? []).map((rn: string) => rn.replace("customers/", ""));

  const out: any[] = [];
  for (const id of ids) {
    const rows = await gaql(
      auth,
      id,
      "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.status FROM customer",
    );
    const c = rows[0]?.customer;
    out.push({
      id: c?.id ? String(c.id).replace(/(\d{3})(\d{3})(\d{3})(\d+)/, "$1-$2-$3-$4") : id,
      descriptive_name: c?.descriptiveName ?? id,
      currency_code: c?.currencyCode ?? null,
      manager: Boolean(c?.manager),
      status: c?.status ?? null,
    });
  }
  return out;
}

/** Danh sách chiến dịch của một tài khoản. */
export async function googleAdsGetCampaigns(
  credentialId: string,
  customerId: string,
  limit = 100,
) {
  const auth = await googleAdsAuth(credentialId);
  const rows = await gaql(
    auth,
    customerId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.daily_budget, campaign.start_date, campaign.end_date
     FROM campaign ORDER BY campaign.name LIMIT ${Math.min(Math.max(limit, 1), 500)}`,
  );
  return rows.map((r: any) => ({
    campaign_id: r.campaign?.id ?? "",
    name: r.campaign?.name ?? "",
    status: r.campaign?.status ?? "",
    channel_type: r.campaign?.advertisingChannelType ?? "",
    daily_budget_micros: Number(r.campaign?.dailyBudget ?? 0),
    start_date: r.campaign?.startDate ?? "",
    end_date: r.campaign?.endDate ?? "",
  }));
}

/** Chỉ số theo ngày của một tài khoản. */
export async function googleAdsGetInsights(
  credentialId: string,
  customerId: string,
  startDate?: string,
  endDate?: string,
) {
  const auth = await googleAdsAuth(credentialId);
  const from = startDate ?? new Date(Date.now() - 7 * 86400e3).toISOString().split("T")[0];
  const to = endDate ?? new Date().toISOString().split("T")[0];
  const rows = await gaql(
    auth,
    customerId,
    `SELECT segments.date, campaign.id, campaign.name, campaign.status,
       metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.conversions
     FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' ORDER BY segments.date DESC`,
  );
  return rows.map((r: any) => ({
    date_start: r.segments?.date ?? "",
    campaign_id: r.campaign?.id ?? "",
    campaign_name: r.campaign?.name ?? "",
    status: r.campaign?.status ?? "",
    spend: Math.round(Number(r.metrics?.costMicros ?? 0) / 1_000_000),
    impressions: Number(r.metrics?.impressions ?? 0),
    clicks: Number(r.metrics?.clicks ?? 0),
    ctr: Number(r.metrics?.ctr ?? 0),
    cpc: Number(r.metrics?.averageCpc ?? 0),
    conversions: Number(r.metrics?.conversions ?? 0),
  }));
}

/** Chi tiết một chiến dịch kèm nhóm quảng cáo. */
export async function googleAdsGetCampaignDetails(credentialId: string, customerId: string, campaignId: string) {
  const auth = await googleAdsAuth(credentialId);
  const rows = await gaql(
    auth,
    customerId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.daily_budget, campaign.budget_id,
       ad_group.id, ad_group.name, ad_group.status
     FROM ad_group WHERE campaign.id = ${campaignId}`,
  );
  const campaign = await gaql(
    auth,
    customerId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.daily_budget, campaign.start_date, campaign.end_date
     FROM campaign WHERE campaign.id = ${campaignId}`,
  );
  return {
    campaign: campaign[0]?.campaign ?? null,
    ad_groups: rows.map((r: any) => ({
      ad_group_id: r.adGroup?.id ?? "",
      name: r.adGroup?.name ?? "",
      status: r.adGroup?.status ?? "",
    })),
  };
}

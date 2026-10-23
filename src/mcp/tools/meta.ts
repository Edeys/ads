// Meta Ads read tools — port of the 7 meta_* tools done.vn exposes,
// plus write tools behind approval gate (our improvement).
// Implementation calls Meta Marketing API v21+ using connection tokens.
import { db } from "@/db";
import { fetchT } from "../../lib/http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { assertRealWrites } from "@/lib/write-guard";

const GRAPH = "https://graph.facebook.com/v21.0";

async function tokenFor(credentialId: string) {
  const conn = await db.select().from(connections).where(eq(connections.id, credentialId)).limit(1);
  if (!conn[0]) throw new Error("Credential không tồn tại");
  return decryptSecret((conn[0].secret as any).enc).access_token;
}

export async function metaGetAdAccounts(credentialId: string) {
  const token = await tokenFor(credentialId);
  const res = await fetchT(`${GRAPH}/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${token}`);
  return res.json();
}

export async function metaGetInsights(credentialId: string, adAccountId: string, level = "campaign", dateRange?: { since: string; until: string }) {
  const token = await tokenFor(credentialId);
  const params = new URLSearchParams({
    access_token: token,
    level,
    fields: "campaign_id,campaign_name,impressions,clicks,spend,reach,actions,cpc,ctr",
    date_preset: "last_7d",
  });
  if (dateRange) {
    params.set("time_range", JSON.stringify({ since: dateRange.since, until: dateRange.until }));
    params.delete("date_preset");
  }
  const res = await fetchT(`${GRAPH}/${adAccountId}/insights?${params}`);
  return res.json();
}

export async function metaGetCampaignDetails(credentialId: string, campaignId: string) {
  const token = await tokenFor(credentialId);
  const res = await fetchT(`${GRAPH}/${campaignId}?fields=id,name,status,objective,daily_budget,budget_remaining,effective_status&access_token=${token}`);
  return res.json();
}

export async function metaGetCampaigns(credentialId: string, adAccountId: string) {
  const token = await tokenFor(credentialId);
  const res = await fetchT(`${GRAPH}/${adAccountId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget&limit=200&access_token=${token}`);
  return res.json();
}

/** Chi tiết một bài viết của fanpage (nội dung, tương tác, trạng thái). */
export async function metaGetPostDetails(credentialId: string, postId: string) {
  const token = await tokenFor(credentialId);
  const res = await fetchT(
    `${GRAPH}/${postId}?fields=id,message,created_time,permalink_url,status,comments_count,like_count,share_count&access_token=${token}`,
  );
  return res.json();
}

/** Bài viết gần đây của một fanpage kèm tương tác. */
export async function metaGetPagePosts(credentialId: string, pageId: string, limit = 20) {
  const token = await tokenFor(credentialId);
  const res = await fetchT(
    `${GRAPH}/${pageId}/posts?fields=id,message,created_time,permalink_url,comments_count,like_count,share_count&limit=${Math.min(Math.max(limit, 1), 100)}&access_token=${token}`,
  );
  return res.json();
}

/** Pixel đang gắn với các ad account của kết nối. */
export async function metaGetPixels(credentialId: string, adAccountId: string) {
  const token = await tokenFor(credentialId);
  const res = await fetchT(
    `${GRAPH}/${adAccountId}/adpixels?fields=id,name,pixel_id,events&limit=100&access_token=${token}`,
  );
  return res.json();
}

// Write — chỉ gọi sau khi approval approved
export async function metaSetCampaignStatus(credentialId: string, campaignId: string, status: "PAUSED" | "ACTIVE") {
  assertRealWrites(`MCP Meta đổi trạng thái campaign ${campaignId} → ${status}`);
  const token = await tokenFor(credentialId);
  const res = await fetchT(`${GRAPH}/${campaignId}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, access_token: token }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

export async function metaSetBudgetByConn(credentialId: string, targetId: string, dailyBudget: number) {
  assertRealWrites(`MCP Meta đổi ngân sách ${targetId}`);
  const token = await tokenFor(credentialId);
  const res = await fetchT(`${GRAPH}/${targetId}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ daily_budget: dailyBudget, access_token: token }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

export async function metaCreateFromPost(credentialId: string, args: any) {
  const { adTemplates } = await import("@/db/schema");
  const { createCampaignFromPost } = await import("@/lib/meta-campaign");
  const [tpl] = await db.select().from(adTemplates).where(eq(adTemplates.id, args.template_id)).limit(1);
  if (!tpl) throw new Error("Template không tồn tại");
  const token = await tokenFor(credentialId);
  return createCampaignFromPost({ token, adAccountId: args.ad_account_id, postId: args.post_id, pageId: args.page_id, template: tpl });
}

// Tạo campaign PAUSED từ bài viết có sẵn — dùng cho post_trigger + quick_ads.
// Pipeline Done.vn: luôn paused để người dùng soát lại trước khi bật.
import type { adTemplates } from "@/db/schema";
import { fetchT } from "./http";
import { assertRealWrites } from "./write-guard";

const GRAPH = "https://graph.facebook.com/v21.0";

type Template = typeof adTemplates.$inferSelect;

const OPT_GOAL: Record<string, string> = {
  OFFSITE_CONVERSIONS: "OFFSITE_CONVERSIONS",
  MESSAGING_PURCHASE_CONVERSION: "CONVERSATIONS",
  POST_ENGAGEMENT: "POST_ENGAGEMENT",
};

async function post(token: string, path: string, body: Record<string, unknown>) {
  const res = await fetchT(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

export async function createCampaignFromPost(opts: {
  token: string;
  adAccountId: string;
  postId: string;          // <page_id>_<post_id>
  pageId: string;
  template: Template;
  campaignName?: string;
}): Promise<{ campaignId: string; adsetId: string; adId: string }> {
  assertRealWrites("Meta tạo campaign từ bài viết");
  const { token, adAccountId, postId, pageId, template } = opts;
  const spec = (template.spec ?? {}) as Record<string, unknown>;
  const acc = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  // 1. Campaign — CBO, paused
  const camp = await post(token, `${acc}/campaigns`, {
    name: opts.campaignName ?? `[auto] ${template.name} — ${new Date().toLocaleDateString("vi-VN")}`,
    objective: template.objective,
    status: "PAUSED",
    special_ad_categories: spec.special_ad_categories ?? [],
    daily_budget: template.dailyBudget,
  });

  // 2. Adset — targeting từ template.spec (default VN 18-65)
  const promoted: Record<string, unknown> = { page_id: pageId };
  if (spec.pixel_id && template.destination === "OFFSITE_CONVERSIONS") {
    promoted.pixel_id = spec.pixel_id;
    promoted.custom_event_type = spec.custom_event_type ?? "PURCHASE";
  }
  const adset = await post(token, `${acc}/adsets`, {
    name: `${camp.id}-adset`,
    campaign_id: camp.id,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: OPT_GOAL[template.destination] ?? "LINK_CLICKS",
    destination_type: template.destination === "MESSAGING_PURCHASE_CONVERSION" ? "MESSENGER" : undefined,
    targeting: spec.targeting ?? { geo_locations: { countries: ["VN"] }, age_min: 18, age_max: 65 },
    promoted_object: promoted,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  });

  // 3. Creative từ bài viết có sẵn
  const creative = await post(token, `${acc}/adcreatives`, {
    name: `${camp.id}-creative`,
    object_story_id: postId,
  });

  // 4. Ad — paused
  const ad = await post(token, `${acc}/ads`, {
    name: `${camp.id}-ad`,
    adset_id: adset.id,
    creative: { creative_id: creative.id },
    status: "PAUSED",
  });

  return { campaignId: camp.id, adsetId: adset.id, adId: ad.id };
}

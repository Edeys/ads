// Metrics catalog — spec §5.3: 18 chỉ số cố định + chọn thêm (Meta 68 / TikTok 40 / Google 32).
// action=action_type trong insights.actions[] — kéo từ breakdown thay vì top-level field.
export interface MetricDef {
  id: string;      // tên cột trong sheet
  label: string;   // hiển thị
  api?: string;    // field gọi API (mặc định = id)
  action?: string; // lấy từ actions[] theo action_type
}

// 18 cột cố định — luôn kéo, luôn là 18 cột đầu
export const FIXED_METRICS: MetricDef[] = [
  { id: "date_start", label: "Ngày" },
  { id: "campaign_id", label: "Campaign ID" },
  { id: "campaign_name", label: "Tên chiến dịch" },
  { id: "adset_id", label: "Adset ID" },
  { id: "adset_name", label: "Tên nhóm QC" },
  { id: "ad_id", label: "Ad ID" },
  { id: "ad_name", label: "Tên quảng cáo" },
  { id: "status", label: "Trạng thái", api: "effective_status" },
  { id: "objective", label: "Mục tiêu" },
  { id: "page_id", label: "Page ID" },
  { id: "post_id", label: "Post ID" },
  { id: "account_name", label: "Tài khoản" },
  { id: "reach", label: "Reach" },
  { id: "impressions", label: "Impressions" },
  { id: "spend", label: "Chi tiêu" },
  { id: "clicks", label: "Clicks" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
];

// Meta selectable — cộng với 18 cố định = 68 chỉ số
export const META_METRICS: MetricDef[] = [
  { id: "frequency", label: "Tần suất" },
  { id: "cpm", label: "CPM" },
  { id: "cpp", label: "CPP" },
  { id: "unique_clicks", label: "Unique clicks" },
  { id: "unique_ctr", label: "Unique CTR" },
  { id: "cost_per_unique_click", label: "Cost/unique click" },
  { id: "inline_link_clicks", label: "Inline link clicks" },
  { id: "inline_link_click_ctr", label: "Inline link CTR" },
  { id: "inline_post_engagement", label: "Inline post engagement" },
  { id: "outbound_clicks", label: "Outbound clicks", action: "outbound_click" },
  { id: "landing_page_views", label: "Landing page views", action: "landing_page_view" },
  { id: "link_clicks", label: "Link clicks", action: "link_click" },
  { id: "post_engagements", label: "Post engagements", action: "post_engagement" },
  { id: "post_reactions", label: "Reactions", action: "post_reaction" },
  { id: "post_comments", label: "Comments", action: "comment" },
  { id: "post_shares", label: "Shares", action: "post" },
  { id: "post_saves", label: "Saves", action: "post_save" },
  { id: "page_engagements", label: "Page engagements", action: "page_engagement" },
  { id: "page_likes", label: "Page likes", action: "like" },
  { id: "video_views", label: "Video views", action: "video_view" },
  { id: "video_p25", label: "Video 25%", action: "video_p25_watched" },
  { id: "video_p50", label: "Video 50%", action: "video_p50_watched" },
  { id: "video_p75", label: "Video 75%", action: "video_p75_watched" },
  { id: "video_p95", label: "Video 95%", action: "video_p95_watched" },
  { id: "video_p100", label: "Video 100%", action: "video_p100_watched" },
  { id: "thruplays", label: "ThruPlay", action: "video_play" },
  { id: "purchases", label: "Lượt mua", action: "offsite_conversion.fb_pixel_purchase" },
  { id: "purchase_value", label: "Giá trị mua", action: "offsite_conversion.fb_pixel_purchase", api: "action_values" },
  { id: "adds_to_cart", label: "Thêm giỏ hàng", action: "offsite_conversion.fb_pixel_add_to_cart" },
  { id: "initiate_checkout", label: "Bắt đầu thanh toán", action: "offsite_conversion.fb_pixel_initiate_checkout" },
  { id: "leads", label: "Leads", action: "offsite_conversion.fb_pixel_lead" },
  { id: "registrations", label: "Đăng ký hoàn tất", action: "offsite_conversion.fb_pixel_complete_registration" },
  { id: "leads_form", label: "Lead form", action: "lead" },
  { id: "onsite_leads", label: "Onsite leads", action: "onsite_conversion.lead_grouped" },
  { id: "msg_conversations", label: "Hội thoại (7d)", action: "messaging_conversation_started_7d" },
  { id: "msg_first_reply", label: "Tin nhắn đầu", action: "onsite_conversion.messaging_first_reply" },
  { id: "msg_purchases", label: "Mua qua tin nhắn", action: "onsite_conversion.purchase" },
  { id: "app_installs", label: "Cài app", action: "app_install" },
  { id: "contact", label: "Liên hệ", action: "contact" },
  { id: "schedule", label: "Đặt lịch", action: "schedule" },
  { id: "search", label: "Tìm kiếm", action: "offsite_conversion.fb_pixel_search" },
  { id: "view_content", label: "Xem nội dung", action: "offsite_conversion.fb_pixel_view_content" },
  { id: "cost_per_purchase", label: "Cost/mua", action: "offsite_conversion.fb_pixel_purchase", api: "cost_per_action_type" },
  { id: "cost_per_lead", label: "Cost/lead", action: "offsite_conversion.fb_pixel_lead", api: "cost_per_action_type" },
  { id: "cost_per_msg", label: "Cost/hội thoại", action: "messaging_conversation_started_7d", api: "cost_per_action_type" },
  { id: "purchase_roas", label: "ROAS", api: "purchase_roas" },
  { id: "website_purchase_roas", label: "Website ROAS", api: "website_purchase_roas" },
  { id: "quality_ranking", label: "Quality ranking" },
  { id: "engagement_rate_ranking", label: "Engagement ranking" },
  { id: "conversion_rate_ranking", label: "Conversion ranking" },
];

export const TIKTOK_METRICS: MetricDef[] = [
  { id: "frequency", label: "Tần suất" }, { id: "cpm", label: "CPM" }, { id: "cpc_tiktok", label: "CPC" },
  { id: "cost_per_conversion", label: "Cost/conversion" }, { id: "conversions", label: "Conversions" },
  { id: "conversion_rate", label: "Conversion rate" }, { id: "conversion_value", label: "Giá trị CV" },
  { id: "likes", label: "Likes" }, { id: "comments", label: "Comments" }, { id: "shares", label: "Shares" },
  { id: "follows", label: "Follows" }, { id: "profile_visits", label: "Profile visits" },
  { id: "video_views_p25", label: "Video 25%" }, { id: "video_views_p50", label: "Video 50%" },
  { id: "video_views_p75", label: "Video 75%" }, { id: "video_views_p100", label: "Video 100%" },
  { id: "video_play_actions", label: "Video plays" }, { id: "average_video_play", label: "Avg play time" },
  { id: "clicks_on_music_disc", label: "Music clicks" }, { id: "button_clicks", label: "Button clicks" },
  { id: "page_event_purchase", label: "Page purchase" }, { id: "page_event_add_to_cart", label: "Add to cart" },
  { id: "page_event_checkout", label: "Checkout" }, { id: "page_event_view_content", label: "View content" },
  { id: "onsite_shopping", label: "Onsite shopping" }, { id: "gmv", label: "GMV" },
  { id: "roas", label: "ROAS" }, { id: "real_time_app_install", label: "App installs" },
  { id: "registration", label: "Đăng ký" }, { id: "total_purchase_value", label: "Tổng GT mua" },
];

export const GOOGLE_METRICS: MetricDef[] = [
  { id: "cost_micros", label: "Chi phí (micros)" }, { id: "average_cpc", label: "CPC TB" },
  { id: "average_cpm", label: "CPM TB" }, { id: "average_cpe", label: "CPE TB" },
  { id: "conversions", label: "Conversions" }, { id: "conversions_value", label: "Giá trị CV" },
  { id: "cost_per_conversion", label: "Cost/CV" }, { id: "all_conversions", label: "All conv." },
  { id: "interactions", label: "Interactions" }, { id: "interaction_rate", label: "Interaction rate" },
  { id: "engagements", label: "Engagements" }, { id: "engagement_rate", label: "Engagement rate" },
  { id: "search_impression_share", label: "Impression share" }, { id: "search_top_is", label: "Top IS" },
  { id: "search_absolute_top_is", label: "Abs top IS" }, { id: "video_views", label: "Video views" },
  { id: "video_view_rate", label: "View rate" }, { id: "phone_calls", label: "Calls" },
  { id: "phone_impressions", label: "Phone impr." }, { id: "active_view_impressions", label: "Active view" },
];

export const METRICS_BY_PROVIDER: Record<string, MetricDef[]> = {
  facebook: META_METRICS,
  tiktok: TIKTOK_METRICS,
  google: GOOGLE_METRICS,
};

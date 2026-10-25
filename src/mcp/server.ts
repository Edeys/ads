// MCP tools registry — JSON-RPC stateless (Done.vn kiểu JSON response).
// Read tools chạy thẳng; write tools tạo approval record chờ duyệt.
import { db } from "@/db";
import { mcpKeys, mcpCallLogs, mcpApprovals, connections, skills } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sha256 } from "@/lib/crypto";
import { applyFieldPreset, describePreset, providerLabel } from "@/lib/field-presets";
import { ENTITY_BY_KEY } from "@/lib/field-catalog";
import { listPostComments, listPagePosts, replyToComment, setCommentHidden, publishPagePost } from "@/lib/meta-page";
import { findCustomTool, listCustomTools, runCustomTool, validateArgs } from "@/lib/custom-tools";
import { growthOverview } from "@/lib/growth";
import { listPublishDestinations } from "@/lib/publish-destinations";
import * as meta from "./tools/meta";
import * as tiktok from "./tools/tiktok";
import * as google from "./tools/google";
import * as googleData from "./tools/google-data";
import * as pancake from "./tools/pancake";
import * as clarity from "./tools/clarity";

type KeyRow = typeof mcpKeys.$inferSelect;

export async function resolveKey(rawKey: string | null): Promise<KeyRow | null> {
  if (!rawKey) return null;
  const rows = await db.select().from(mcpKeys).where(eq(mcpKeys.keyHash, sha256(rawKey))).limit(1);
  const key = rows[0];
  if (!key || key.status !== "active") return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  return key;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required });
const str = (d: string) => ({ type: "string", description: d });

type Tool = {
  name: string; description: string;
  inputSchema: Record<string, unknown>;
  write?: boolean;
  scope: string; // key trong key.scopes
  run: (key: KeyRow, args: any) => Promise<unknown>;
};

const TOOLS: Tool[] = [
  // --- Meta Ads tools ---
  { name: "meta_get_ad_accounts", description: "Danh sách tài khoản quảng cáo Meta", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection meta_ads") }, ["credential_id"]),
    run: (_k, a) => meta.metaGetAdAccounts(a.credential_id) },
  { name: "meta_get_insights", description: "Chỉ số quảng cáo: chi tiêu, click, CTR, CPA...", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection"), ad_account_id: str("act_xxx"), level: { type: "string", enum: ["campaign", "adset", "ad"] }, date_preset: str("today|yesterday|last_7d|last_30d") }, ["credential_id", "ad_account_id"]),
    run: (_k, a) => meta.metaGetInsights(a.credential_id, a.ad_account_id, a.level) },
  { name: "meta_get_campaign_details", description: "Chi tiết chiến dịch kèm nhóm quảng cáo", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection"), campaign_id: str("ID campaign") }, ["credential_id", "campaign_id"]),
    run: (_k, a) => meta.metaGetCampaignDetails(a.credential_id, a.campaign_id) },
  { name: "meta_get_pages", description: "Danh sách Facebook Page", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection") }, ["credential_id"]),
    run: async (_k, a) => {
      const [conn] = await db.select().from(connections).where(eq(connections.id, a.credential_id)).limit(1);
      return (conn?.meta as any)?.pages ?? [];
    } },
  { name: "meta_list_campaigns", description: "List campaigns của 1 ad account", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection"), ad_account_id: str("act_xxx") }, ["credential_id", "ad_account_id"]),
    run: async (_k, a) => meta.metaGetCampaigns(a.credential_id, a.ad_account_id) },
  { name: "meta_get_post_details", description: "Chi tiết một bài viết của fanpage (nội dung, tương tác, trạng thái)", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection"), post_id: str("ID bài viết") }, ["credential_id", "post_id"]),
    run: async (_k, a) => meta.metaGetPostDetails(a.credential_id, a.post_id) },
  { name: "meta_get_page_posts", description: "Bài viết gần đây của một fanpage kèm tương tác", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection"), page_id: str("Page ID"), limit: { type: "number", description: "Số lượng, mặc định 20" } }, ["credential_id", "page_id"]),
    run: async (_k, a) => meta.metaGetPagePosts(a.credential_id, a.page_id, a.limit ?? 20) },
  { name: "meta_get_pixels", description: "Pixel đang gắn với ad account", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection"), ad_account_id: str("act_xxx") }, ["credential_id", "ad_account_id"]),
    run: async (_k, a) => meta.metaGetPixels(a.credential_id, a.ad_account_id) },

  // --- TikTok Ads tools ---
  { name: "tiktok_get_ad_accounts", description: "Danh sách tài khoản quảng cáo TikTok", scope: "tiktok_ads",
    inputSchema: obj({ credential_id: str("ID connection tiktok_ads") }, ["credential_id"]),
    run: (_k, a) => tiktok.tiktokGetAdAccounts(a.credential_id) },
  { name: "tiktok_get_insights", description: "Chỉ số quảng cáo TikTok (spend, clicks, conversions)", scope: "tiktok_ads",
    inputSchema: obj({ credential_id: str("ID connection"), advertiser_id: str("Advertiser ID"), start_date: str("YYYY-MM-DD"), end_date: str("YYYY-MM-DD") }, ["credential_id", "advertiser_id"]),
    run: (_k, a) => tiktok.tiktokInsights(a.credential_id, a.advertiser_id, a.start_date, a.end_date) },
  { name: "tiktok_get_gmv_max_stores", description: "Danh sách cửa hàng GMV Max", scope: "tiktok_ads",
    inputSchema: obj({ credential_id: str("ID connection"), advertiser_id: str("Advertiser ID") }, ["credential_id", "advertiser_id"]),
    run: (_k, a) => tiktok.tiktokGmvStores(a.credential_id, a.advertiser_id) },

  // --- Google Ads tools ---
  { name: "google_ads_get_accounts", description: "Danh sách tài khoản quảng cáo Google Ads mà token truy cập được", scope: "google_ads",
    inputSchema: obj({ credential_id: str("ID connection google_ads") }, ["credential_id"]),
    run: (_k, a) => google.googleAdsGetAccounts(a.credential_id) },
  { name: "google_ads_get_campaigns", description: "Danh sách chiến dịch Google Ads của một tài khoản", scope: "google_ads",
    inputSchema: obj({ credential_id: str("ID connection"), customer_id: str("Google Ads customer id (123-456-7890)"), limit: { type: "number", description: "Số chiến dịch tối đa (mặc định 100)" } }, ["credential_id", "customer_id"]),
    run: (_k, a) => google.googleAdsGetCampaigns(a.credential_id, a.customer_id, a.limit ?? 100) },
  { name: "google_ads_get_insights", description: "Chỉ số Google Ads theo ngày (chi tiêu, hiển thị, click, CTR, conversions)", scope: "google_ads",
    inputSchema: obj({ credential_id: str("ID connection"), customer_id: str("Google Ads customer id"), start_date: str("YYYY-MM-DD, tuỳ chọn"), end_date: str("YYYY-MM-DD, tuỳ chọn") }, ["credential_id", "customer_id"]),
    run: (_k, a) => google.googleAdsGetInsights(a.credential_id, a.customer_id, a.start_date, a.end_date) },
  { name: "google_ads_get_campaign_details", description: "Chi tiết chiến dịch Google Ads kèm nhóm quảng cáo", scope: "google_ads",
    inputSchema: obj({ credential_id: str("ID connection"), customer_id: str("Google Ads customer id"), campaign_id: str("ID chiến dịch") }, ["credential_id", "customer_id", "campaign_id"]),
    run: (_k, a) => google.googleAdsGetCampaignDetails(a.credential_id, a.customer_id, a.campaign_id) },

  // --- Google Search Console & GA4 tools ---
  { name: "search_console_list_sites", description: "Danh sách site đã xác minh trong Google Search Console", scope: "search_console",
    inputSchema: obj({ credential_id: str("ID connection google_search_console") }, ["credential_id"]),
    run: (_k, a) => googleData.searchConsoleListSites(a.credential_id) },
  { name: "search_console_get_performance", description: "Hiệu suất tìm kiếm: impressions, clicks, CTR, vị trí trung bình theo query/page/country/device", scope: "search_console",
    inputSchema: obj({
      credential_id: str("ID connection google_search_console"),
      site_url: str("Site URL đúng như trong Search Console, vd https://example.com/"),
      start_date: str("YYYY-MM-DD (mặc định 28 ngày trước)"),
      end_date: str("YYYY-MM-DD (mặc định hôm qua)"),
      dimensions: { type: "array", items: { type: "string", enum: ["query", "page", "country", "device", "date"] }, description: "Tối đa 3 chiều" },
      row_limit: { type: "number", description: "Số dòng, mặc định 100, tối đa 25000" },
    }, ["credential_id", "site_url"]),
    run: (_k, a) => googleData.searchConsoleQuery(a.credential_id, a.site_url, {
      startDate: a.start_date, endDate: a.end_date, dimensions: a.dimensions, rowLimit: a.row_limit,
    }) },

  { name: "google_analytics_list_properties", description: "Danh sách property GA4 mà tài khoản Google được cấp quyền", scope: "ga4",
    inputSchema: obj({ credential_id: str("ID connection ga4") }, ["credential_id"]),
    run: (_k, a) => googleData.ga4ListProperties(a.credential_id) },
  { name: "google_analytics_get_report", description: "Báo cáo GA4: phiên, người dùng, lượt xem trang, chuyển đổi theo chiều tuỳ chọn", scope: "ga4",
    inputSchema: obj({
      credential_id: str("ID connection ga4"),
      property_id: str("Property ID (số), lấy từ google_analytics_list_properties"),
      start_date: str("YYYY-MM-DD hoặc 28daysAgo (mặc định 28daysAgo)"),
      end_date: str("YYYY-MM-DD hoặc yesterday (mặc định yesterday)"),
      dimensions: { type: "array", items: { type: "string" }, description: "vd [\"sessionDefaultChannelGroup\"] hoặc [\"date\",\"sessionSource\"]" },
      metrics: { type: "array", items: { type: "string" }, description: "vd [\"sessions\",\"totalUsers\",\"conversions\"]" },
      limit: { type: "number", description: "Số dòng, mặc định 100" },
    }, ["credential_id", "property_id"]),
    run: (_k, a) => googleData.ga4RunReport(a.credential_id, a.property_id, {
      startDate: a.start_date, endDate: a.end_date, dimensions: a.dimensions, metrics: a.metrics, limit: a.limit,
    }) },

  // --- Microsoft Clarity ---
  { name: "clarity_get_live_insights", description: "Hành vi người dùng Clarity (traffic, scroll depth, rage click, dead click...) 1–3 ngày gần nhất", scope: "clarity",
    inputSchema: obj({
      credential_id: str("ID connection clarity"),
      num_of_days: { type: "number", enum: [1, 2, 3], description: "Số ngày gần nhất (mặc định 1)" },
      dimension1: str("Browser | Device | Country/Region | OS | Source | Medium | Campaign | Channel | URL"),
      dimension2: str("Chiều thứ 2 (tuỳ chọn)"),
      dimension3: str("Chiều thứ 3 (tuỳ chọn)"),
    }, ["credential_id"]),
    run: (_k, a) => clarity.clarityLiveInsights(a.credential_id, {
      numOfDays: a.num_of_days,
      dimensions: [a.dimension1, a.dimension2, a.dimension3].filter(Boolean),
    }) },

  // --- Pancake POS & CRM tools ---
  { name: "pancake_get_shops", description: "Danh sách cửa hàng Pancake", scope: "pancake",
    inputSchema: obj({ credential_id: str("ID connection pancake") }, ["credential_id"]),
    run: (_k, a) => pancake.pancakeGetShops(a.credential_id) },
  { name: "pancake_get_orders", description: "Danh sách đơn hàng Pancake", scope: "pancake",
    inputSchema: obj({ credential_id: str("ID connection"), shop_id: str("Shop ID tuỳ chọn") }, ["credential_id"]),
    run: (_k, a) => pancake.pancakeGetOrders(a.credential_id, a.shop_id) },
  { name: "pancake_get_order_detail", description: "Chi tiết một đơn hàng Pancake", scope: "pancake",
    inputSchema: obj({ credential_id: str("ID connection"), order_id: str("ID đơn hàng") }, ["credential_id", "order_id"]),
    run: (_k, a) => pancake.pancakeGetOrderDetail(a.credential_id, a.order_id) },
  { name: "pancake_get_products", description: "Danh sách sản phẩm Pancake", scope: "pancake",
    inputSchema: obj({ credential_id: str("ID connection") }, ["credential_id"]),
    run: (_k, a) => pancake.pancakeGetProducts(a.credential_id) },
  { name: "pancake_get_customers", description: "Danh sách khách hàng Pancake", scope: "pancake",
    inputSchema: obj({ credential_id: str("ID connection") }, ["credential_id"]),
    run: (_k, a) => pancake.pancakeGetCustomers(a.credential_id) },
  { name: "pancake_get_inventory", description: "Báo cáo tồn kho Pancake", scope: "pancake",
    inputSchema: obj({ credential_id: str("ID connection") }, ["credential_id"]),
    run: (_k, a) => pancake.pancakeGetInventory(a.credential_id) },
  { name: "pancake_get_statistics", description: "Thống kê bán hàng Pancake", scope: "pancake",
    inputSchema: obj({ credential_id: str("ID connection") }, ["credential_id"]),
    run: (_k, a) => pancake.pancakeGetStatistics(a.credential_id) },

  // --- Social: comment + publishing (fork full-feature) ---
  { name: "meta_get_post_comments", description: "Danh sách comment của một bài viết page (kèm trạng thái ẩn)", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection"), post_id: str("ID bài viết (page_post_id)"), limit: { type: "number", description: "Số lượng, mặc định 50" } }, ["credential_id", "post_id"]),
    run: (_k, a) => listPostComments(a.credential_id, a.post_id, { limit: a.limit ?? 50 }) },
  { name: "meta_list_page_posts", description: "Danh sách bài viết gần đây của page kèm tương tác (like/comment/share)", scope: "meta_ads",
    inputSchema: obj({ credential_id: str("ID connection"), page_id: str("Page ID"), limit: { type: "number", description: "Số lượng, mặc định 20" } }, ["credential_id", "page_id"]),
    run: (_k, a) => listPagePosts(a.credential_id, a.page_id, { limit: a.limit ?? 20 }) },

  { name: "meta_reply_comment", description: "Trả lời công khai comment/bài viết (tạo approval, owner duyệt mới chạy)", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), target_id: str("comment_id hoặc post_id"), page_id: str("Page ID"), message: str("Nội dung trả lời"), is_reply: { type: "boolean", description: "true = trả lời vào comment, false = comment lên post" } }, ["credential_id", "target_id", "page_id", "message"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_reply_comment", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },
  { name: "meta_hide_comment", description: "Ẩn / hiện một comment (tạo approval)", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), comment_id: str("ID comment"), page_id: str("Page ID"), hidden: { type: "boolean", description: "true = ẩn, false = hiện lại" } }, ["credential_id", "comment_id", "page_id"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_hide_comment", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },
  { name: "meta_publish_post", description: "Đăng bài mới lên fanpage ngay (tạo approval — soạn nội dung rồi owner duyệt)", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), page_id: str("Page ID"), message: str("Nội dung bài viết"), link_url: str("Link đính kèm (tuỳ chọn)"), photos: { type: "array", items: { type: "string" }, description: "URL ảnh công khai (tối đa 10)" }, video_url: str("URL video (tuỳ chọn)") }, ["credential_id", "page_id", "message"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_publish_post", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },
  { name: "meta_schedule_post", description: "Lên lịch đăng bài (10 phút – 30 ngày, tạo approval)", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), page_id: str("Page ID"), message: str("Nội dung"), scheduled_at: str("ISO datetime giờ VN"), photos: { type: "array", items: { type: "string" } } }, ["credential_id", "page_id", "message", "scheduled_at"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_schedule_post", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },

  // --- Common tools ---
  { name: "adssync_list_connections", description: "List connections của Biz", scope: "*",
    inputSchema: obj({}),
    run: async (k) => {
      const rows = await db.select({ id: connections.id, provider: connections.provider, name: connections.name, health: connections.health })
        .from(connections).where(eq(connections.bizId, k.bizId));
      return rows;
    } },

  // --- Growth overview: kéo số liệu 28 ngày qua từ mọi nguồn đã kết nối ---
  { name: "adssync_growth_overview", description: "Tổng quan tăng trưởng 28 ngày qua: Search Console (clicks, impressions, vị trí), GA4 (sessions, users), Clarity, Meta Ads (chi tiêu, clicks). Mỗi nguồn ghi rõ khoảng ngày, tài khoản và trạng thái — nguồn lỗi không làm mất nguồn khác", scope: "*",
    inputSchema: obj({}),
    run: (k) => growthOverview(k.bizId) },

  // --- Social đa mạng: agent xem đích → soạn → xin duyệt đăng/lịch ---
  { name: "adssync_list_publish_destinations", description: "Danh sách đích đăng bài khả dụng của Biz: Facebook Page, Instagram, X, LinkedIn, TikTok, Threads, board Pinterest — kèm connection_id và ref_id dùng cho social_publish_post / social_schedule_post", scope: "*",
    inputSchema: obj({}),
    run: (k) => listPublishDestinations(k.bizId) },
  { name: "social_publish_post", description: "Đăng bài lên NHIỀU mạng cùng lúc (tạo approval — owner duyệt trong app mới chạy). Gọi adssync_list_publish_destinations trước để lấy connection_id/ref_id. Ảnh qua photos (URL công khai)", scope: "write", write: true,
    inputSchema: obj({
      targets: { type: "array", maxItems: 10, description: "Các đích đăng", items: { type: "object", properties: {
        type: { type: "string", enum: ["meta_page", "instagram", "x_twitter", "linkedin", "tiktok", "threads", "pinterest"], description: "Loại đích" },
        connection_id: { type: "string", description: "ID connection từ adssync_list_publish_destinations" },
        ref_id: { type: "string", description: "page/IG/board id — bỏ trống với X/LinkedIn/TikTok/Threads để tự dò" },
        label: { type: "string", description: "Tên hiển thị trong phiếu duyệt" },
      }, required: ["type", "connection_id"] } },
      message: str("Nội dung bài viết"),
      link_url: str("Link đính kèm (tuỳ chọn)"),
      photos: { type: "array", items: { type: "string" }, description: "URL ảnh công khai — BẮT BUỘC với Instagram/TikTok/Pinterest" },
      video_url: str("URL video công khai (tuỳ chọn, Instagram/Facebook)"),
    }, ["targets", "message"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "social_publish_post", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id, note: "Owner duyệt trong màn Phê duyệt thì bài mới đăng từng đích" }; } },
  { name: "social_schedule_post", description: "Lên lịch đăng bài đa mạng (tạo approval). Worker tự đăng đúng giờ, từng đích độc lập — đích lỗi không chặn đích khác", scope: "write", write: true,
    inputSchema: obj({
      targets: { type: "array", maxItems: 10, items: { type: "object", properties: {
        type: { type: "string", enum: ["meta_page", "instagram", "x_twitter", "linkedin", "tiktok", "threads", "pinterest"] },
        connection_id: { type: "string" },
        ref_id: { type: "string" },
        label: { type: "string" },
      }, required: ["type", "connection_id"] } },
      message: str("Nội dung bài viết"),
      link_url: str("Link đính kèm (tuỳ chọn)"),
      photos: { type: "array", items: { type: "string" }, description: "URL ảnh công khai" },
      video_url: str("URL video (tuỳ chọn)"),
      scheduled_at: str("ISO datetime giờ VN, tối thiểu 10 phút nữa"),
    }, ["targets", "message", "scheduled_at"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "social_schedule_post", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },

  // --- Write tools (Approval Gate) ---
  { name: "meta_toggle_ads", description: "Bật / tắt chiến dịch, nhóm, quảng cáo", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), target_id: str("ID target"), status: str("ACTIVE | PAUSED") }, ["credential_id", "target_id", "status"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_toggle_ads", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },
  { name: "meta_pause_campaign", description: "Tắt chiến dịch (tạo approval, owner duyệt mới chạy)", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), campaign_id: str("ID campaign"), reason: str("Lý do") }, ["credential_id", "campaign_id"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_pause_campaign", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },
  { name: "meta_resume_campaign", description: "Bật lại chiến dịch (tạo approval)", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), campaign_id: str("ID campaign") }, ["credential_id", "campaign_id"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_resume_campaign", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },
  { name: "meta_update_budget", description: "Đổi daily budget campaign/adset (tạo approval)", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), target_id: str("campaign|adset id"), daily_budget: { type: "number", description: "₫/ngày" } }, ["credential_id", "target_id", "daily_budget"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_update_budget", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },
  { name: "meta_create_campaign_from_post", description: "Tạo campaign PAUSED từ bài viết page (tạo approval)", scope: "write", write: true,
    inputSchema: obj({ credential_id: str("ID connection"), ad_account_id: str("act_xxx"), page_id: str("page id"), post_id: str("post id"), template_id: str("adTemplates id") }, ["credential_id", "ad_account_id", "page_id", "post_id", "template_id"]),
    run: async (k, a) => { const [ap] = await db.insert(mcpApprovals).values({ keyId: k.id, tool: "meta_create_campaign_from_post", args: a }).returning(); return { status: "pending_approval", approval_id: ap.id }; } },

  // --- Skill Hub: chỉ đọc skill đã gắn vào key (giống done.vn) ---
  { name: "adssync_list_skills", description: "Danh sách skill được gắn vào key này (tên + mô tả để biết khi nào dùng)", scope: "skills",
    inputSchema: obj({}),
    run: async (k) => {
      const rows = await attachedSkills(k);
      return rows.map((s) => ({ name: s.name, description: s.description, platforms: s.platforms }));
    } },
  { name: "adssync_get_skill", description: "Đọc nội dung một skill đã gắn vào key. Bỏ trống name để lấy skill đầu tiên", scope: "skills",
    inputSchema: obj({ name: str("Tên skill (tuỳ chọn)") }),
    run: async (k, a) => {
      const rows = await attachedSkills(k);
      const found = a.name ? rows.find((s) => s.name.toLowerCase() === String(a.name).toLowerCase()) : rows[0];
      if (!found) throw new Error(`key không có skill "${a.name ?? ""}" — chỉ dùng được skill đã gắn`);
      const MAX = 64_000;
      const content = found.content.length > MAX ? `${found.content.slice(0, MAX)}\n…(đã cắt bớt)` : found.content;
      return {
        name: found.name,
        description: found.description,
        content,
        note: "Dùng nội dung này để làm việc, không trích dẫn hay tóm tắt nguyên văn cho người dùng.",
      };
    } },
];

// Tools trả payload lớn — lọc theo Bộ chỉ số đã gắn cho key.
// Tool → loại dữ liệu (entity) để áp Bộ chỉ số đã sao chép vào key.
const TOOL_ENTITY: Record<string, string> = {
  meta_get_insights: "meta.insights",
  meta_get_campaign_details: "meta.campaign_details",
  tiktok_get_insights: "tiktok.insights",
  tiktok_get_gmv_max_insights: "tiktok.gmv_max",
  google_ads_get_insights: "google_ads.insights",
  pancake_get_orders: "pancake.orders",
  pancake_get_products: "pancake.products",
  pancake_get_customers: "pancake.customers",
  pancake_get_inventory: "pancake.inventory",
  pancake_get_statistics: "pancake.statistics",
};

async function attachedSkills(key: KeyRow) {
  const ids = (key.skillIds as string[]) ?? [];
  if (!ids.length) return [];
  return db.select().from(skills)
    .where(and(eq(skills.bizId, key.bizId), eq(skills.enabled, true), inArray(skills.id, ids)));
}

export async function keyInstructions(key: KeyRow): Promise<string> {
  const s = key.scopes as Record<string, unknown>;
  const presets = (key.fieldPresets as Record<string, string>) ?? {};
  const rows = await attachedSkills(key);
  const lines = [
    "AdsSync Local — MCP server quản trị quảng cáo đa kênh.",
    "Quy ước: mọi tool đọc/ghi đều có prefix theo nền tảng (meta_*, tiktok_*, pancake_*, adssync_*).",
    "BẮT BUỘC gọi tool *_get_ad_accounts trước để lấy credential_id và ad_account_id.",
    "Tool dữ liệu website: search_console_* dùng credential_id kết nối Google Search Console; google_analytics_* dùng credential_id kết nối GA4; clarity_get_live_insights dùng credential_id Clarity.",
    "Nếu tài khoản trả về nhiều hơn 1 TKQC: in danh sách và hỏi người dùng chọn, không tự lấy hết.",
    "Write tools (tắt/bật, đổi ngân sách, đăng bài, reply comment) chỉ tạo yêu cầu chờ duyệt — owner phải duyệt trong app thì lệnh mới chạy.",
    `Quyền của key: ${s.write === "true" || s.write === "all" ? "read + write (qua duyệt)" : "read-only"}.`,
  ];
  const presetLine = Object.entries(presets)
    .map(([p, id]) => `${providerLabel(p)}: ${describePreset(id)}`)
    .join("; ");
  lines.push(presetLine ? `Bộ chỉ số đang áp dụng — ${presetLine}.` : "Bộ chỉ số: toàn bộ field mặc định.");
  if (rows.length) {
    lines.push(`Skill được gắn vào key (dùng adssync_get_skill để đọc): ${rows.map((r) => `${r.name} — ${r.description || "không mô tả"}`).join(" | ")}`);
    lines.push("Chỉ được dùng skill đã gắn; hỏi skill khác sẽ bị từ chối.");
  }
  return lines.join("\n");
}

function keyAllowed(key: KeyRow, t: Tool): boolean {
  const s = key.scopes as Record<string, unknown>;
  const allowed = s.allowedTools as string[] | undefined;
  if (Array.isArray(allowed) && !allowed.includes(t.name)) return false;
  if (t.scope === "*") return true;
  if (t.scope === "skills") return ((key.skillIds as string[]) ?? []).length > 0;
  if (t.scope === "write") return s.write === "true" || s.write === "all";
  if (t.scope === "pancake") return s.pancake === "all" || s.pancake === "read" || s["pancake:read"] === "true";
  return s[t.scope] === "all" || s[t.scope] === "read";
}

export async function listTools(key: KeyRow) {
  const builtins = TOOLS.filter((t) => keyAllowed(key, t))
    .map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));

  // Tool SDK: custom tools của Biz (manifest HTTP) — luôn công khai cho key đang hoạt động.
  const custom = await listCustomTools(key.bizId, true);
  return [
    ...builtins,
    ...custom.map((t) => ({
      name: t.name,
      description: `${t.description || "Custom tool"} (custom · ${t.method} ${t.url}${t.requiresApproval ? " · cần duyệt" : ""})`,
      inputSchema: t.inputSchema,
    })),
  ];
}

// Cắt payload theo Bộ chỉ số đã sao chép vào key — giảm token, tránh limit chat UI.
async function withPreset(key: KeyRow, toolName: string, result: unknown) {
  const entity = TOOL_ENTITY[toolName];
  if (!entity) return result;
  const config = (key.fieldConfig as Record<string, string[] | string>) ?? {};
  if (!Object.keys(config).length) return result; // key cũ chưa có bộ chỉ số ⇒ trả đầy đủ
  const raw = config[entity];
  const fields = Array.isArray(raw) && raw.length ? raw : ENTITY_BY_KEY[entity]?.minimal ?? null;
  if (!fields) return result;
  return applyFieldPreset(result, fields);
}

export async function callTool(key: KeyRow, name: string, args: unknown) {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return callCustomTool(key, name, args);
  if (!keyAllowed(key, t)) throw new Error(`key không có quyền tool ${name}`);
  await assertConnectionInBiz(args, key.bizId, name);
  const t0 = Date.now();
  try {
    const result = await t.run(key, args);
    const filtered = await withPreset(key, name, result);
    db.update(mcpKeys).set({ lastUsedAt: new Date() }).where(eq(mcpKeys.id, key.id)).catch(() => {});
    db.insert(mcpCallLogs).values({ keyId: key.id, tool: name, latencyMs: Date.now() - t0, ok: true }).catch(() => {});
    return filtered;
  } catch (e) {
    db.insert(mcpCallLogs).values({ keyId: key.id, tool: name, latencyMs: Date.now() - t0, ok: false }).catch(() => {});
    throw e;
  }
}

// Mọi tool nhận credential_id phải dùng connection thuộc cùng workspace với
// key — chặn key của biz A đọc/ghi connection của biz B qua ID đoán được.
async function assertConnectionInBiz(args: unknown, bizId: string, toolName: string) {
  const credId = (args as Record<string, unknown> | null)?.credential_id;
  if (typeof credId !== "string" || !credId) return;
  const [conn] = await db.select({ bizId: connections.bizId }).from(connections).where(eq(connections.id, credId)).limit(1);
  if (!conn) throw new Error(`[${toolName}] credential_id không tồn tại: ${credId}`);
  if (conn.bizId !== bizId) throw new Error(`[${toolName}] credential_id không thuộc workspace của key này`);
}

// Custom tool: chạy qua manifest HTTP. Tool có side effect (requiresApproval) thì
// chỉ tạo approval — owner duyệt trong app thì mới thực thi.
async function callCustomTool(key: KeyRow, name: string, rawArgs: unknown) {
  const tool = await findCustomTool(key.bizId, name);
  if (!tool || !tool.enabled) throw new Error(`tool không tồn tại: ${name}`);

  const checked = validateArgs(tool, rawArgs);
  if (!checked.ok) throw new Error(checked.error);

  const t0 = Date.now();

  if (tool.requiresApproval) {
    const [ap] = await db
      .insert(mcpApprovals)
      .values({ keyId: key.id, tool: `custom:${tool.id}`, args: checked.args })
      .returning();
    return {
      status: "pending_approval",
      approval_id: ap.id,
      tool: tool.name,
      message: "Tool này có side effect — owner duyệt trong màn Phê duyệt thì mới chạy.",
    };
  }

  const result = await runCustomTool(tool, checked.args);
  await db
    .update(mcpKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpKeys.id, key.id))
    .catch(() => {});
  db.insert(mcpCallLogs)
    .values({ keyId: key.id, tool: name, latencyMs: Date.now() - t0, ok: result.ok })
    .catch(() => {});
  return result;
}

// Thực thi approval đã duyệt — gọi từ approvals route.
export async function executeApproval(tool: string, args: any, ctx?: { bizId?: string }): Promise<unknown> {
  // Recheck lúc THỰC THI (không chỉ lúc agent tạo): connection phải còn thuộc
  // đúng workspace — chống approval stale sau khi connection bị chuyển/xoá.
  if (ctx?.bizId && typeof args?.credential_id === "string" && args.credential_id) {
    await assertConnectionInBiz(args, ctx.bizId, `approval:${tool}`);
  }
  if (tool.startsWith("custom:")) {
    const id = tool.slice("custom:".length);
    const { db: schemaDb, schema: sch } = await import("@/db");
    const { and, eq } = await import("drizzle-orm");
    const [row] = await schemaDb
      .select()
      .from(sch.customTools)
      .where(ctx?.bizId ? and(eq(sch.customTools.id, id), eq(sch.customTools.bizId, ctx.bizId)) : eq(sch.customTools.id, id))
      .limit(1);
    if (!row) throw new Error("custom tool không tồn tại");
    if (!row.enabled) throw new Error("custom tool đang tắt");
    const { runCustomTool } = await import("@/lib/custom-tools");
    const result = await runCustomTool(row, args ?? {});
    if (!result.ok) throw new Error(`tool lỗi (HTTP ${result.status || "network"}): ${JSON.stringify(result.data)}`);
    return result;
  }
  if (tool === "meta_toggle_ads") return meta.metaSetCampaignStatus(args.credential_id, args.target_id, args.status);
  if (tool === "meta_pause_campaign") return meta.metaSetCampaignStatus(args.credential_id, args.campaign_id, "PAUSED");
  if (tool === "meta_resume_campaign") return meta.metaSetCampaignStatus(args.credential_id, args.campaign_id, "ACTIVE");
  if (tool === "meta_update_budget") return meta.metaSetBudgetByConn(args.credential_id, args.target_id, args.daily_budget);
  if (tool === "meta_create_campaign_from_post") return meta.metaCreateFromPost(args.credential_id, args);
  // --- Social tools ---
  if (tool === "meta_reply_comment") return replyToComment(args.credential_id, args.target_id, args.message, Boolean(args.is_reply));
  if (tool === "meta_hide_comment") return setCommentHidden(args.credential_id, args.comment_id, args.hidden !== false);
  if (tool === "meta_publish_post") {
    const r = await publishPagePost(args.credential_id, args.page_id, {
      message: args.message, linkUrl: args.link_url ?? undefined,
      photos: args.photos ?? [], videoUrl: args.video_url ?? undefined,
    });
    if (ctx?.bizId) {
      const { scheduledPosts, scheduledPostTargets } = await import("@/db/schema");
      const [row] = await db.insert(scheduledPosts).values({
        bizId: ctx.bizId,
        message: String(args.message), linkUrl: args.link_url ?? null,
        photos: args.photos ?? [], videoUrl: args.video_url ?? null,
        mode: "now", status: "published", postId: r.postId, publishedAt: new Date(),
      }).returning();
      await db.insert(scheduledPostTargets).values({
        scheduledPostId: row.id, type: "meta_page",
        connectionId: args.credential_id, refId: String(args.page_id),
        status: "published", postId: r.postId, publishedAt: new Date(),
      });
    }
    return r;
  }
  if (tool === "meta_schedule_post") {
    if (!ctx?.bizId) throw new Error("meta_schedule_post cần ctx.bizId");
    const { scheduledPosts, scheduledPostTargets } = await import("@/db/schema");
    const [row] = await db.insert(scheduledPosts).values({
      bizId: ctx.bizId,
      message: String(args.message), photos: args.photos ?? [],
      mode: "schedule", status: "scheduled", scheduledAt: new Date(args.scheduled_at),
    }).returning();
    await db.insert(scheduledPostTargets).values({
      scheduledPostId: row.id, type: "meta_page",
      connectionId: args.credential_id, refId: String(args.page_id),
    });
    return { scheduled_post_id: row.id, scheduledAt: row.scheduledAt, note: "Worker sẽ tự đăng đúng giờ" };
  }
  if (tool === "social_publish_post" || tool === "social_schedule_post") {
    if (!ctx?.bizId) throw new Error(`${tool} cần ctx.bizId`);
    const { scheduledPosts, scheduledPostTargets } = await import("@/db/schema");
    const raw = (Array.isArray(args.targets) ? args.targets : []).slice(0, 10);
    if (!raw.length) throw new Error("Thiếu targets");
    // Recheck lúc THỰC THI: mọi connection của từng đích phải thuộc workspace duyệt.
    for (const t of raw) {
      const [c] = await db.select({ bizId: connections.bizId }).from(connections)
        .where(eq(connections.id, String(t.connection_id))).limit(1);
      if (!c || c.bizId !== ctx.bizId) throw new Error(`Đích ${t.type ?? "?"}: connection không thuộc workspace — từ chối`);
    }
    const schedule = tool === "social_schedule_post";
    let scheduledAt: Date | null = null;
    if (schedule) {
      scheduledAt = new Date(args.scheduled_at);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("scheduled_at sai định dạng ISO");
      if (scheduledAt.getTime() <= Date.now()) throw new Error("scheduled_at phải ở tương lai");
    }
    const [row] = await db.insert(scheduledPosts).values({
      bizId: ctx.bizId,
      message: String(args.message ?? ""), linkUrl: args.link_url ?? null,
      photos: (args.photos ?? []).slice(0, 10), videoUrl: args.video_url ?? null,
      mode: schedule ? "schedule" : "now",
      status: schedule ? "scheduled" : "publishing",
      scheduledAt,
    }).returning();
    await db.insert(scheduledPostTargets).values(raw.map((t: any) => ({
      scheduledPostId: row.id, type: String(t.type ?? "meta_page"),
      connectionId: String(t.connection_id), refId: String(t.ref_id ?? ""), label: t.label ?? null,
    })));
    if (schedule) {
      return { scheduled_post_id: row.id, scheduledAt: row.scheduledAt, targets: raw.length, note: "Worker tự đăng từng đích đúng giờ" };
    }
    const { runAllPendingTargets } = await import("@/lib/post-targets");
    const { results, rollup } = await runAllPendingTargets(row);
    return {
      status: rollup?.status ?? "publishing",
      targets: results.map((x: any) => ({ refId: x.target.refId, label: x.target.label, ok: x.result.ok, postId: x.result.postId ?? null, error: x.result.error ?? null })),
    };
  }
  throw new Error(`tool không hỗ trợ: ${tool}`);
}

// Registry scope cấp quyền cho từng nền tảng quảng cáo.
//
// Trước đây scope nằm rải rác trong route start/callback nên dễ lệch giữa các
// nơi và không biết "quyền nào đã cấp / thiếu quyền gì". Ở đây scope là một
// registry: mỗi scope có key, nhãn tiếng Việt, mô tả, và nhóm tính năng dùng nó.
// Route start đọc từ đây, route callback đối chiếu scope đã cấp, UI hiển thị
// trạng thái thiếu quyền — tất cả từ một nguồn duy nhất.

export type ScopeGroup =
  | "read_ads" // đọc chiến dịch, chỉ số
  | "write_ads" // bật/tắt, đổi ngân sách, tạo chiến dịch
  | "business" // đọc cấu trúc business, ad account
  | "pages" // đọc fanpage
  | "publish" // đăng bài, quản lý bài viết
  | "engage" // trả lời/ẩn comment
  | "messaging" // nhắn tin riêng
  | "analytics" // GA4, hành vi website
  | "seo" // Search Console
  | "insights"; // đọc chỉ số nâng cao (IG, lead)

export type ScopeDef = {
  /** Chuỗi scope gửi cho nhà cung cấp (tên chính thức của Meta/Google). */
  scope: string;
  /** Key nội bộ để lưu trạng thái "đã cấp / thiếu". */
  key: string;
  label: string;
  description: string;
  group: ScopeGroup;
  /** Nhà cung cấp có yêu cầu duyệt app / app review cho quyền này không. */
  needsReview: boolean;
};

export const SCOPE_GROUP_LABELS: Record<ScopeGroup, string> = {
  read_ads: "Đọc quảng cáo",
  write_ads: "Ghi quảng cáo",
  business: "Business & tài khoản",
  pages: "Fanpage",
  publish: "Đăng bài",
  engage: "Tương tác",
  messaging: "Nhắn tin",
  analytics: "Phân tích website",
  seo: "SEO & tìm kiếm",
  insights: "Chỉ số nâng cao",
};

// ---------------------------------------------------------------- Meta Ads --

export const META_SCOPES: ScopeDef[] = [
  {
    scope: "ads_read",
    key: "ads_read",
    label: "Đọc chiến dịch và chỉ số",
    description: "Xem chiến dịch, nhóm quảng cáo, quảng cáo và số liệu chi tiêu/click.",
    group: "read_ads",
    needsReview: false,
  },
  {
    scope: "ads_management",
    key: "ads_management",
    label: "Quản lý chiến dịch",
    description: "Tạo, sửa, bật/tắt chiến dịch, đổi ngân sách, đặt mục tiêu.",
    group: "write_ads",
    needsReview: false,
  },
  {
    scope: "business_management",
    key: "business_management",
    label: "Đọc Business & tài khoản quảng cáo",
    description: "Liệt kê ad account, page, pixel, danh mục thuộc business của bạn.",
    group: "business",
    needsReview: false,
  },
  {
    scope: "pages_show_list",
    key: "pages_show_list",
    label: "Xem danh sách fanpage",
    description: "Liệt kê các fanpage mà tài khoản có quyền quản lý.",
    group: "pages",
    needsReview: false,
  },
  {
    scope: "pages_read_engagement",
    key: "pages_read_engagement",
    label: "Đọc fanpage và bài viết",
    description: "Đọc thông tin fanpage, bài viết và tương tác trên bài.",
    group: "pages",
    needsReview: false,
  },
  {
    scope: "pages_manage_posts",
    key: "pages_manage_posts",
    label: "Đăng và quản lý bài viết",
    description: "Đăng bài, lên lịch đăng, sửa và xoá bài trên fanpage.",
    group: "publish",
    needsReview: true,
  },
  {
    scope: "pages_manage_engagement",
    key: "pages_manage_engagement",
    label: "Trả lời và ẩn bình luận",
    description: "Trả lời công khai, ẩn/hiện bình luận trên bài viết của fanpage.",
    group: "engage",
    needsReview: true,
  },
  {
    scope: "publish_video",
    key: "publish_video",
    label: "Đăng video",
    description: "Đăng video lên fanpage từ hệ thống.",
    group: "publish",
    needsReview: true,
  },
  {
    scope: "pages_messaging",
    key: "pages_messaging",
    label: "Nhắn tin riêng qua fanpage",
    description: "Gửi tin nhắn riêng cho khách từ fanpage.",
    group: "messaging",
    needsReview: true,
  },
  {
    scope: "instagram_basic",
    key: "instagram_basic",
    label: "Đọc tài khoản Instagram",
    description: "Liệt kê và đọc thông tin tài khoản Instagram gắn với fanpage.",
    group: "pages",
    needsReview: false,
  },
  {
    scope: "instagram_manage_insights",
    key: "instagram_manage_insights",
    label: "Chỉ số Instagram",
    description: "Đọc chỉ số quảng cáo và nội dung của tài khoản Instagram.",
    group: "insights",
    needsReview: true,
  },
  {
    scope: "catalog_management",
    key: "catalog_management",
    label: "Quản lý danh mục sản phẩm",
    description: "Đọc và cập nhật danh mục sản phẩm dùng cho quảng cáo dạng danh mục.",
    group: "business",
    needsReview: true,
  },
  {
    scope: "leads_retrieval",
    key: "leads_retrieval",
    label: "Đọc lead đã thu thập",
    description: "Lấy danh sách lead từ biểu mẫu quảng cáo để theo dõi chuyển đổi.",
    group: "insights",
    needsReview: true,
  },
];

// ------------------------------------------------------------- Google Ads --

export const GOOGLE_ADS_SCOPES: ScopeDef[] = [
  {
    scope: "https://www.googleapis.com/auth/adwords",
    key: "adwords",
    label: "Google Ads API",
    description: "Đọc và ghi chiến dịch, bộ chỉ số, ngân sách trên Google Ads.",
    group: "read_ads",
    needsReview: false,
  },
  {
    scope: "openid",
    key: "openid",
    label: "OpenID",
    description: "Xác minh danh tính người dùng đăng nhập Google.",
    group: "business",
    needsReview: false,
  },
  {
    scope: "https://www.googleapis.com/auth/userinfo.email",
    key: "userinfo_email",
    label: "Email người dùng",
    description: "Đọc email để gắn tài khoản quảng cáo vào đúng người dùng.",
    group: "business",
    needsReview: false,
  },
  {
    scope: "https://www.googleapis.com/auth/userinfo.profile",
    key: "userinfo_profile",
    label: "Hồ sơ người dùng",
    description: "Đọc tên và ảnh đại diện của tài khoản Google.",
    group: "business",
    needsReview: false,
  },
];

// -------------------------------------------------------------- TikTok Ads --

export const TIKTOK_SCOPES: ScopeDef[] = [
  {
    scope: "ads.management",
    key: "ads_management",
    label: "Quản lý quảng cáo TikTok",
    description: "Đọc và ghi chiến dịch, nhóm quảng cáo, ngân sách TikTok Ads.",
    group: "write_ads",
    needsReview: true,
  },
  {
    scope: "ads.read",
    key: "ads_read",
    label: "Đọc quảng cáo TikTok",
    description: "Đọc chỉ số chi tiêu, click, chuyển đổi của TikTok Ads.",
    group: "read_ads",
    needsReview: true,
  },
  {
    scope: "ads.finance",
    key: "ads_finance",
    label: "Dữ liệu tài chính TikTok",
    description: "Đọc số dư và lịch sử giao dịch tài khoản quảng cáo.",
    group: "insights",
    needsReview: true,
  },
  {
    scope: "agent.advertiser",
    key: "agent_advertiser",
    label: "Quản lý advertiser",
    description: "Liệt kê và chọn advertiser mà tài khoản có quyền.",
    group: "business",
    needsReview: true,
  },
];

// --------------------------------------------------- Google Search Console --
// Chỉ cần quyền đọc: tool của AdsSync không sửa dữ liệu Search Console.
export const SEARCH_CONSOLE_SCOPES: ScopeDef[] = [
  {
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    key: "webmasters",
    label: "Search Console (đọc)",
    description: "Đọc site đã xác minh, impressions, clicks, CTR và vị trí trung bình.",
    group: "seo",
    needsReview: false,
  },
  {
    scope: "openid",
    key: "openid",
    label: "OpenID",
    description: "Xác minh danh tính tài khoản Google đang cấp quyền.",
    group: "business",
    needsReview: false,
  },
  {
    scope: "https://www.googleapis.com/auth/userinfo.email",
    key: "userinfo_email",
    label: "Email người dùng",
    description: "Hiển thị tài khoản Google nào đang kết nối.",
    group: "business",
    needsReview: false,
  },
];

// --------------------------------------------------------------------- GA4 --
export const GA4_SCOPES: ScopeDef[] = [
  {
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    key: "analytics",
    label: "Google Analytics 4 (đọc)",
    description: "Đọc property, số phiên, người dùng, nguồn truy cập và sự kiện chuyển đổi.",
    group: "analytics",
    needsReview: false,
  },
  {
    scope: "openid",
    key: "openid",
    label: "OpenID",
    description: "Xác minh danh tính tài khoản Google đang cấp quyền.",
    group: "business",
    needsReview: false,
  },
  {
    scope: "https://www.googleapis.com/auth/userinfo.email",
    key: "userinfo_email",
    label: "Email người dùng",
    description: "Hiển thị tài khoản Google nào đang kết nối.",
    group: "business",
    needsReview: false,
  },
];

// ------------------------------------------------------------- Google Sheets --

export const SHEETS_SCOPES: ScopeDef[] = [  {
    scope: "https://www.googleapis.com/auth/spreadsheets",
    key: "sheets_rw",
    label: "Google Sheets (đọc/ghi)",
    description: "Ghi chỉ số quảng cáo và đọc dữ liệu trong sheet đích.",
    group: "business",
    needsReview: false,
  },
  {
    scope: "https://www.googleapis.com/auth/drive",
    key: "drive",
    label: "Google Drive",
    description: "Tìm và mở file trong Drive (cần cho sheet dùng chung).",
    group: "business",
    needsReview: false,
  },
];

export type ScopeProvider = "meta" | "google" | "tiktok" | "sheets" | "search_console" | "ga4";

export const PROVIDER_SCOPES: Record<ScopeProvider, ScopeDef[]> = {
  meta: META_SCOPES,
  google: GOOGLE_ADS_SCOPES,
  tiktok: TIKTOK_SCOPES,
  sheets: SHEETS_SCOPES,
  search_console: SEARCH_CONSOLE_SCOPES,
  ga4: GA4_SCOPES,
};

/** Chuỗi scope gửi cho provider (dùng cho OAuth dialog). */
export function scopeString(provider: ScopeProvider, keys?: string[]): string {
  const all = PROVIDER_SCOPES[provider];
  const picked = keys?.length ? all.filter((s) => keys.includes(s.key)) : all;
  // Google (và Google Sheets) yêu cầu scope phân tách bằng DẤU CÁCH; dùng dấu
  // phẩy sẽ bị invalid_scope. Meta/TikTok dùng dấu phẩy.
  const separator = provider === "google" || provider === "sheets" || provider === "search_console" || provider === "ga4" ? " " : ",";
  return picked.map((s) => s.scope).join(separator);
}

/**
 * Scope mặc định khi bấm "Kết nối nhanh".
 *
 * Meta: không đưa `business_management` vào mặc định vì quyền này chỉ được cấp
 * khi ứng dụng đã gắn Business Portfolio. App chưa có portfolio thì Facebook
 * trả về "Sorry, something went wrong" cho cả dialog — dù các quyền khác hợp lệ.
 * Người dùng vẫn cấp thêm được sau khi tạo portfolio (xem nhóm "Business").
 */
export function defaultScopeKeys(provider: ScopeProvider): string[] {
  switch (provider) {
    case "meta":
      return ["ads_read", "ads_management", "pages_show_list", "pages_read_engagement"];
    case "google":
      return ["adwords", "openid", "userinfo_email"];
    case "tiktok":
      return ["ads_read", "ads_management", "agent_advertiser"];
    case "sheets":
      return ["sheets_rw"];
    case "search_console":
      return ["webmasters", "openid", "userinfo_email"];
    case "ga4":
      return ["analytics", "openid", "userinfo_email"];
  }
}

/**
 * Chuẩn hoá danh sách scope đã cấp (từ provider trả về) về key nội bộ.
 * Provider trả về scope dạng chuỗi phân tách bởi dấu cách hoặc phẩy.
 */
export function grantedKeys(provider: ScopeProvider, granted: string | string[] | undefined | null): string[] {
  if (!granted) return [];
  const list = Array.isArray(granted) ? granted : String(granted).split(/[\s,]+/);
  const norm = list.map((s) => s.trim()).filter(Boolean);
  const defs = PROVIDER_SCOPES[provider];
  const keys: string[] = [];
  for (const d of defs) {
    if (norm.includes(d.scope)) keys.push(d.key);
    // Google trả scope dạng đầy đủ URL, một số provider trả dạng rút gọn.
    else if (norm.includes(d.key)) keys.push(d.key);
  }
  return [...new Set(keys)];
}

/** Scope của provider mà token hiện tại chưa có. */
export function missingScopes(provider: ScopeProvider, granted: string | string[] | undefined | null): ScopeDef[] {
  const have = new Set(grantedKeys(provider, granted));
  return PROVIDER_SCOPES[provider].filter((s) => !have.has(s.key));
}

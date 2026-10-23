// Provider catalog — pure data, client-safe (không import crypto/db).
// spec §5.2: 5 nhóm (ads/sales/ai/notify/other) + "Sắp ra mắt".

export type ProviderGroup = "ads" | "sales" | "ai" | "notify" | "other";
export type AuthType = "oauth" | "token" | "apikey" | "service_account" | "bot" | "url_only";

export interface ProviderField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;          // render password input
  required?: boolean;
  target: "secret" | "meta"; // encrypt vào secret{} hay lưu plain vào meta{}
  textarea?: boolean;
}

export interface ProviderDef {
  id: string;
  label: string;
  group: ProviderGroup;
  auth: AuthType;
  fields: ProviderField[];
  comingSoon?: boolean;
  hint?: string;
}

export const GROUP_LABELS: Record<ProviderGroup, string> = {
  ads: "Quảng cáo",
  sales: "Bán hàng",
  ai: "AI",
  notify: "Thông báo",
  other: "Khác",
};

export const PROVIDERS: ProviderDef[] = [
  // ---- Quảng cáo ----
  {
    id: "meta_ads", label: "Meta Ads", group: "ads", auth: "oauth",
    hint: "Dán Access Token (System User/long-lived) — hệ thống tự kéo ad accounts + pages",
    fields: [
      { key: "access_token", label: "Access Token", secret: true, required: true, target: "secret", placeholder: "EAAG..." },
    ],
  },
  {
    id: "tiktok_ads", label: "TikTok Ads", group: "ads", auth: "oauth",
    hint: "Dán Access Token từ TikTok Marketing API",
    fields: [
      { key: "access_token", label: "Access Token", secret: true, required: true, target: "secret" },
      { key: "advertiser_id", label: "Advertiser ID", target: "meta", placeholder: "7xxxxxxxxxx" },
    ],
  },
  {
    id: "google_ads", label: "Google Ads", group: "ads", auth: "oauth",
    hint: "Cần developer token + OAuth — hiện lưu trước credential",
    fields: [
      { key: "developer_token", label: "Developer Token", secret: true, target: "secret" },
      { key: "refresh_token", label: "Refresh Token", secret: true, target: "secret" },
      { key: "customer_id", label: "Customer ID", target: "meta", placeholder: "123-456-7890" },
    ],
  },
  { id: "openai_ads", label: "OpenAI Ads", group: "ads", auth: "apikey", comingSoon: true, fields: [] },

  // ---- Bán hàng ----
  {
    id: "pancake_pos", label: "Pancake POS", group: "sales", auth: "apikey",
    fields: [{ key: "access_token", label: "Access Token", secret: true, required: true, target: "secret" }],
  },
  {
    id: "pancake_crm", label: "Pancake CRM", group: "sales", auth: "apikey",
    fields: [{ key: "access_token", label: "Access Token", secret: true, required: true, target: "secret" }],
  },
  {
    id: "pancake_chat", label: "Pancake Chat", group: "sales", auth: "apikey",
    fields: [{ key: "access_token", label: "Access Token", secret: true, required: true, target: "secret" }],
  },
  {
    id: "nhanhvn", label: "Nhanh.vn", group: "sales", auth: "apikey",
    fields: [
      { key: "api_key", label: "API Key", secret: true, required: true, target: "secret" },
      { key: "store_id", label: "Store ID", target: "meta" },
    ],
  },
  {
    id: "sapo", label: "Sapo", group: "sales", auth: "apikey",
    fields: [
      { key: "api_key", label: "API Key", secret: true, required: true, target: "secret" },
      { key: "store", label: "Tên gian hàng (*.mysapo.net)", target: "meta" },
    ],
  },
  { id: "shopify", label: "Shopify", group: "sales", auth: "apikey", comingSoon: true, fields: [] },
  { id: "woocommerce", label: "WooCommerce", group: "sales", auth: "apikey", comingSoon: true, fields: [] },
  { id: "getfly", label: "GetFly CRM", group: "sales", auth: "apikey", comingSoon: true, fields: [] },
  { id: "odoo", label: "Odoo", group: "sales", auth: "apikey", comingSoon: true, fields: [] },

  // ---- AI ----
  {
    id: "gemini", label: "Gemini", group: "ai", auth: "apikey",
    fields: [{ key: "api_key", label: "API Key", secret: true, required: true, target: "secret" }],
  },
  {
    id: "openai", label: "OpenAI", group: "ai", auth: "apikey",
    fields: [{ key: "api_key", label: "API Key", secret: true, required: true, target: "secret" }],
  },
  {
    id: "anthropic", label: "Anthropic", group: "ai", auth: "apikey",
    fields: [{ key: "api_key", label: "API Key", secret: true, required: true, target: "secret" }],
  },
  {
    id: "deepseek", label: "DeepSeek", group: "ai", auth: "apikey",
    fields: [{ key: "api_key", label: "API Key", secret: true, required: true, target: "secret" }],
  },
  {
    id: "openai_compatible", label: "OpenAI-compatible", group: "ai", auth: "apikey",
    fields: [
      { key: "base_url", label: "Base URL", required: true, target: "meta", placeholder: "https://api.example.com/v1" },
      { key: "api_key", label: "API Key", secret: true, required: true, target: "secret" },
    ],
  },

  // ---- Thông báo ----
  {
    id: "telegram", label: "Telegram Bot", group: "notify", auth: "bot",
    fields: [
      { key: "bot_token", label: "Bot Token", secret: true, required: true, target: "secret", placeholder: "123456:ABC..." },
      { key: "chat_id", label: "Chat ID mặc định", target: "meta", placeholder: "-100xxx hoặc @channel" },
    ],
  },
  { id: "zalo_bot", label: "Zalo Bot", group: "notify", auth: "apikey", comingSoon: true, fields: [] },

  // ---- Khác ----
  {
    id: "google_sheets", label: "Google Sheets", group: "other", auth: "service_account",
    hint: "Dán JSON service account (đã share quyền Editor vào sheet đích)",
    fields: [
      { key: "service_account_json", label: "Service Account JSON", secret: true, required: true, target: "secret", textarea: true },
      { key: "default_sheet_id", label: "Sheet ID mặc định", target: "meta" },
    ],
  },
  {
    id: "webhook", label: "Webhook", group: "other", auth: "url_only",
    fields: [{ key: "url", label: "Webhook URL", required: true, target: "meta", placeholder: "https://..." }],
  },
  {
    id: "page_whitelist", label: "Whitelist Page", group: "other", auth: "url_only",
    fields: [{ key: "page_ids", label: "Page IDs (phân cách dấu phẩy)", required: true, target: "meta" }],
  },

  // ---- Sắp ra mắt ----
  { id: "bigquery", label: "BigQuery", group: "other", auth: "apikey", comingSoon: true, fields: [] },
  { id: "postgresql", label: "PostgreSQL", group: "other", auth: "apikey", comingSoon: true, fields: [] },
  // ---- Phân tích & SEO ----
  {
    id: "ga4", label: "Google Analytics 4", group: "other", auth: "oauth",
    hint: "Kết nối bằng Google OAuth (quyền analytics.readonly) để đọc property, phiên, người dùng và chuyển đổi.",
    fields: [
      { key: "refresh_token", label: "Refresh Token", secret: true, required: true, target: "secret" },
      { key: "client_id", label: "OAuth Client ID (tuỳ chọn)", target: "secret" },
      { key: "client_secret", label: "OAuth Client Secret (tuỳ chọn)", secret: true, target: "secret" },
      { key: "property_id", label: "Property ID mặc định (tuỳ chọn)", target: "meta", placeholder: "123456789" },
    ],
  },
  {
    id: "google_search_console", label: "Google Search Console", group: "other", auth: "oauth",
    hint: "Kết nối bằng Google OAuth (quyền webmasters.readonly) để đọc impressions, clicks, CTR và vị trí.",
    fields: [
      { key: "refresh_token", label: "Refresh Token", secret: true, required: true, target: "secret" },
      { key: "client_id", label: "OAuth Client ID (tuỳ chọn)", target: "secret" },
      { key: "client_secret", label: "OAuth Client Secret (tuỳ chọn)", secret: true, target: "secret" },
      { key: "site_url", label: "Site URL mặc định (tuỳ chọn)", target: "meta", placeholder: "https://example.com/" },
    ],
  },
  {
    id: "clarity", label: "Microsoft Clarity", group: "other", auth: "apikey",
    hint: "Token tạo tại Clarity → Settings → Data Export. API chỉ trả 1–3 ngày gần nhất, tối đa 10 request/ngày.",
    fields: [
      { key: "api_token", label: "API Token", secret: true, required: true, target: "secret" },
      { key: "project_name", label: "Tên project (để nhận biết)", target: "meta" },
    ],
  },
  { id: "haravan", label: "Haravan", group: "sales", auth: "apikey", comingSoon: true, fields: [] },
  { id: "kiotviet", label: "KiotViet", group: "sales", auth: "apikey", comingSoon: true, fields: [] },
  { id: "bitrix24", label: "Bitrix24", group: "sales", auth: "apikey", comingSoon: true, fields: [] },
];

export const providerById = (id: string) => PROVIDERS.find((p) => p.id === id);

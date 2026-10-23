import { pgTable, uuid, text, varchar, integer, bigint, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

// ---------- Auth & Tenancy ----------
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  image: text("image"),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull(), // google
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: bigint("expires_at", { mode: "number" }),
  tokenType: varchar("token_type", { length: 40 }),
  scope: text("scope"),
  idToken: text("id_token"),
}, (t) => [uniqueIndex("accounts_provider_pair").on(t.provider, t.providerAccountId)]);

export const bizs = pgTable("bizs", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  isPersonal: boolean("is_personal").default(false).notNull(),
  ownerId: uuid("owner_id").references(() => users.id).notNull(),
  vatTaxCode: varchar("vat_tax_code", { length: 32 }),
  vatCompanyName: varchar("vat_company_name", { length: 255 }),
  vatCompanyAddress: text("vat_company_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 18 permission keys (spec §4 + 3 quyền mở rộng social: comment, publisher, events)
export const PERMISSIONS = [
  "jobs.access", "credentials.access", "post_triggers.access", "mcp_keys.access",
  "budget_schedules.access", "billing.view", "billing.manage", "team.manage",
  "org.delete", "metric_sync.access", "auto_pause.access", "quick_ads.access",
  "mcp_server.access", "bigquery.access", "ad_metrics.access",
  "comments.access", "publisher.access", "events.access",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const SENSITIVE_PERMISSIONS: Permission[] = ["billing.manage", "org.delete"];

export const members = pgTable("members", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role", { length: 20 }).default("member").notNull(), // owner | member
  permissions: jsonb("permissions").$type<Permission[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("members_biz_user").on(t.bizId, t.userId)]);

export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  permissions: jsonb("permissions").$type<Permission[]>().default([]).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending|accepted|expired|revoked
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Connections (provider credentials) ----------
export const PROVIDER_GROUPS = {
  ads: ["meta_ads", "tiktok_ads", "google_ads", "openai_ads"],
  sales: ["pancake_pos", "pancake_crm", "pancake_chat", "nhanhvn", "sapo", "shopify", "woocommerce", "getfly", "odoo"],
  ai: ["gemini", "openai", "anthropic", "deepseek", "openai_compatible"],
  notify: ["telegram", "zalo_bot"],
  other: ["google_sheets", "webhook", "page_whitelist"],
} as const;

export const connections = pgTable("connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 40 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  // tokens/secrets -> encrypted at rest (AES-256-GCM, see src/lib/crypto.ts)
  secret: jsonb("secret").$type<Record<string, string>>().default({}).notNull(),
  // provider-specific metadata: ad_account_id, pages[], currency, etc.
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
  health: varchar("health", { length: 20 }).default("ok").notNull(), // ok|expiring|dead|disabled|unchecked
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("connections_biz").on(t.bizId)]);

// ---------- Shared entities ----------
export const cpaThresholds = pgTable("cpa_thresholds", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  platform: varchar("platform", { length: 20 }).notNull(), // meta|tiktok|google
  name: varchar("name", { length: 120 }).notNull(),
  // per-objective VND thresholds; null = không áp
  limits: jsonb("limits").$type<{
    replies?: { perPurchase?: number; perMessage?: number };
    offsite_conversions?: { perPurchase?: number; perRegistration?: number };
    lead_generation?: { perLead?: number; perRegistration?: number };
  }>().default({}).notNull(),
  minDataPct: integer("min_data_pct").default(120).notNull(), // % CPA mục tiêu = đủ data
  maxPct: integer("max_pct").default(200).notNull(),          // % vượt = tắt ngay
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adTemplates = pgTable("ad_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  objective: varchar("objective", { length: 60 }).notNull(), // OUTCOME_SALES|OUTCOME_ENGAGEMENT|...
  destination: varchar("destination", { length: 60 }).notNull(), // OFFSITE_CONVERSIONS|MESSAGING_PURCHASE_CONVERSION|POST_ENGAGEMENT
  dailyBudget: bigint("daily_budget", { mode: "number" }).notNull(),
  spec: jsonb("spec").$type<Record<string, unknown>>().default({}).notNull(), // targeting, pixel, placements...
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const webhooks = pgTable("webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Automation configs (4 loại job) ----------
// Cầu nối đăng nhập cho bản desktop: Google OAuth chạy ở trình duyệt hệ thống
// (Google chặn user-agent webview), nên sau khi đăng nhập thành công, cookie phiên
// được chuyển sang webview qua "bridge" này.
export const desktopAuthBridges = pgTable("desktop_auth_bridges", {
  id: text("id").primaryKey(), // random token (code) truyền qua URL
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }),
  name: varchar("name", { length: 255 }),
  sessionCookieName: varchar("session_cookie_name", { length: 80 }),
  sessionCookieEnc: text("session_cookie_enc"), // cookie phiên (mã hoá)
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("desktop_auth_bridges_expires").on(t.expiresAt)]);

export const configs = pgTable("configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 30 }).notNull(), // metrics_pull|auto_pause|budget_schedule|post_trigger
  name: varchar("name", { length: 160 }).notNull(),
  provider: varchar("provider", { length: 20 }).notNull(), // facebook|tiktok|google|openai
  credentialId: uuid("credential_id").references(() => connections.id),
  intervalMinutes: integer("interval_minutes").default(30).notNull(), // 10|30|60
  params: jsonb("params").$type<Record<string, unknown>>().default({}).notNull(),
  status: varchar("status", { length: 20 }).default("on").notNull(), // on|off|error
  lastRunAt: timestamp("last_run_at"),
  lastRunStatus: varchar("last_run_status", { length: 20 }), // ok|error|skipped
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("configs_biz_type").on(t.bizId, t.type)]);

// params shapes per type:
// metrics_pull: { adAccountId, sheetId, sheetTab, writeMode: 'update'|'append', dateRange:{from,to}, metrics:string[], webhookId? }
// auto_pause: { adAccountId, level: 'campaign'|'adset'|'ad', thresholdId, protectedCampaignIds[], telegramConnId, aiConnId, qlbhConnId?, autoRecreate:{enabled,budget}, pageWhitelistIds[] }
// budget_schedule: { adAccountId, targetLevel:'campaign'|'adset', targetId, slots:[{from:'HH:mm',to:'HH:mm',budget}] }
// post_trigger: { credentialId, pageId, templateId, keywords[], hashtags[], notifyConnId }

// Better-than-donevn: lưu từng lượt chạy (họ chỉ lưu lượt gần nhất)
export const configRuns = pgTable("config_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  configId: uuid("config_id").references(() => configs.id, { onDelete: "cascade" }).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
  status: varchar("status", { length: 20 }).notNull(), // ok|error|skipped
  detail: jsonb("detail").$type<Record<string, unknown>>().default({}).notNull(),
  error: text("error"),
}, (t) => [index("runs_config").on(t.configId, t.startedAt)]);

// Better-than-donevn: lưu từng action autopilot (họ chỉ bắn Telegram)
export const autopilotActions = pgTable("autopilot_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  configId: uuid("config_id").references(() => configs.id, { onDelete: "cascade" }).notNull(),
  targetType: varchar("target_type", { length: 20 }).notNull(), // campaign|adset|ad
  targetId: varchar("target_id", { length: 60 }).notNull(),
  action: varchar("action", { length: 30 }).notNull(), // paused|kept_by_ai|paused_whitelist|recreated
  cpa: bigint("cpa", { mode: "number" }),
  reason: text("reason"),
  aiTokensIn: integer("ai_tokens_in"),
  aiTokensOut: integer("ai_tokens_out"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("ap_actions_config").on(t.configId, t.createdAt)]);

// ---------- MCP layer (nâng cấp: có write + approval) ----------
export const mcpKeys = pgTable("mcp_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 120 }),
  keyHash: varchar("key_hash", { length: 64 }).notNull().unique(), // sha256(key); plaintext chỉ trả 1 lần
  keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),      // mcp_XXXX... hiển thị
  // scope: { meta_ads:'all'|'read'|'none', google_ads:..., tiktok_ads:..., write:boolean }
  scopes: jsonb("scopes").$type<Record<string, string>>().default({}).notNull(),
  fieldPresets: jsonb("field_presets").$type<Record<string, string>>().default({}).notNull(), // provider->presetId (legacy)
  fieldConfig: jsonb("field_config").$type<Record<string, string[] | string>>().default({}).notNull(), // entity->fields | "toi-gian"
  skillIds: jsonb("skill_ids").$type<string[]>().default([]).notNull(),
  expiresAt: timestamp("expires_at"),
  status: varchar("status", { length: 20 }).default("active").notNull(), // active|paused|revoked
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const fieldPresets = pgTable("field_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }), // null = preset hệ thống
  provider: varchar("provider", { length: 40 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(), // Tối giản|Đề xuất|custom
  fields: jsonb("fields").$type<string[]>().default([]).notNull(), // legacy: danh sách field phẳng
  config: jsonb("config").$type<Record<string, string[]>>().default({}).notNull(), // entity -> fields
  isSystem: boolean("is_system").default(false).notNull(),
});

export const skills = pgTable("skills", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").default("").notNull(), // quyết định AI có dùng skill hay không
  platforms: jsonb("platforms").$type<string[]>().default([]).notNull(), // nền tảng đề xuất
  fileName: varchar("file_name", { length: 200 }),
  enabled: boolean("enabled").default(true).notNull(),
  content: text("content").notNull(), // SKILL.md body (extracted from .skill/.zip)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Writes qua MCP phải qua approval — khác Done.vn
export const mcpApprovals = pgTable("mcp_approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  keyId: uuid("key_id").references(() => mcpKeys.id, { onDelete: "cascade" }).notNull(),
  tool: varchar("tool", { length: 80 }).notNull(),
  args: jsonb("args").$type<Record<string, unknown>>().notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending|approved|rejected|executed|failed
  result: jsonb("result").$type<Record<string, unknown>>(),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("approvals_status").on(t.status)]);

export const mcpCallLogs = pgTable("mcp_call_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  keyId: uuid("key_id").references(() => mcpKeys.id, { onDelete: "cascade" }).notNull(),
  tool: varchar("tool", { length: 80 }).notNull(),
  latencyMs: integer("latency_ms"),
  ok: boolean("ok").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("mcp_logs_key").on(t.keyId, t.createdAt)]);

// ---------- Ad metrics table layout (mỗi người, mỗi nền tảng) ----------
export const adTableLayouts = pgTable("ad_table_layouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  platform: varchar("platform", { length: 20 }).notNull(), // meta|tiktok|google
  columns: jsonb("columns").$type<{ key: string; starred?: boolean }[]>().default([]).notNull(),
  mergeAccounts: boolean("merge_accounts").default(false).notNull(),
  defaultLevel: varchar("default_level", { length: 10 }).default("campaign").notNull(), // campaign|adset|ad
  customFields: jsonb("custom_fields").$type<{
    key: string; name: string; formula: string; format: string; decimals: number;
  }[]>().default([]).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("ad_layout_user_platform").on(t.bizId, t.userId, t.platform)]);

// ---------- Billing ----------
export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  tier: varchar("tier", { length: 20 }).default("trial").notNull(), // trial|small|pro|business|custom
  quota: jsonb("quota").$type<{ tkqc: number; qlbh: number; staff: number; minSyncMinutes: number }>()
    .default({ tkqc: 3, qlbh: 1, staff: 1, minSyncMinutes: 30 }).notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  status: varchar("status", { length: 20 }).default("active").notNull(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: varchar("currency", { length: 8 }).default("VND").notNull(),
  detail: jsonb("detail").$type<Record<string, unknown>>().default({}).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending|paid|cancelled
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Audit & AI usage ----------
export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  action: varchar("action", { length: 80 }).notNull(),
  status: varchar("status", { length: 20 }).default("success").notNull(),
  objectType: varchar("object_type", { length: 60 }),
  objectId: varchar("object_id", { length: 80 }),
  detail: jsonb("detail").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("activity_biz").on(t.bizId, t.createdAt)]);

export const aiUsages = pgTable("ai_usages", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  connectionId: uuid("connection_id").references(() => connections.id),
  model: varchar("model", { length: 60 }),
  purpose: varchar("purpose", { length: 40 }).notNull(), // policy_check|cpa_analysis|...
  tokensIn: integer("tokens_in").default(0),
  tokensOut: integer("tokens_out").default(0),
  costUsd: bigint("cost_usd_micros", { mode: "number" }).default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Social: page subscription (Meta Page Webhooks 'feed') ----------
export const pageSubscriptions = pgTable("page_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "cascade" }).notNull(),
  pageId: varchar("page_id", { length: 40 }).notNull(),
  pageName: varchar("page_name", { length: 255 }),
  verifyToken: varchar("verify_token", { length: 64 }).notNull(),
  subscribedFields: jsonb("subscribed_fields").$type<string[]>().default(["feed"]).notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(), // active|paused
  lastEventAt: timestamp("last_event_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("pagesub_biz_page").on(t.bizId, t.pageId)]);

// ---------- Social: comment auto-reply rules ----------
export const commentRules = pgTable("comment_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  pageId: varchar("page_id", { length: 40 }), // null = áp cho mọi page của Biz
  matchMode: varchar("match_mode", { length: 10 }).default("any").notNull(), // any|all
  keywords: jsonb("keywords").$type<string[]>().default([]).notNull(), // khớp trong nội dung comment (không phân biệt hoa thường)
  // hành động khi khớp
  actions: jsonb("actions").$type<{
    reply?: string;          // trả lời công khai
    privateReply?: string;   // nhắn tin riêng cho người comment
    hide?: boolean;          // ẩn comment
    notifyTelegramConnId?: string;
    webhookN8n?: boolean;    // bắn event sang n8n/outbound webhooks
  }>().default({}).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  priority: integer("priority").default(100).notNull(), // số nhỏ chạy trước
  hitCount: integer("hit_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("comment_rules_biz").on(t.bizId)]);

// ---------- Social: comment events (cache + log hành động) ----------
export const commentEvents = pgTable("comment_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  pageId: varchar("page_id", { length: 40 }).notNull(),
  postId: varchar("post_id", { length: 60 }).notNull(),
  commentId: varchar("comment_id", { length: 60 }).notNull(), // comment gốc; reply thì là id reply
  parentCommentId: varchar("parent_comment_id", { length: 60 }), // null = comment gốc trên post
  authorId: varchar("author_id", { length: 60 }),
  authorName: varchar("author_name", { length: 255 }),
  message: text("message").notNull(),
  hidden: boolean("hidden").default(false).notNull(),
  likeCount: integer("like_count").default(0).notNull(),
  verb: varchar("verb", { length: 20 }).default("add").notNull(), // add|edited|remove
  source: varchar("source", { length: 20 }).default("webhook").notNull(), // webhook|poll|manual
  // rule engine outcome
  ruleId: uuid("rule_id").references(() => commentRules.id),
  ruleAction: varchar("rule_action", { length: 40 }), // replied|hidden|private_replied|notified|skipped|error
  replyText: text("reply_text"),
  privateReplySent: boolean("private_reply_sent").default(false).notNull(),
  fbCreatedAt: timestamp("fb_created_at"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("comment_event_unique").on(t.commentId),
  index("comment_events_biz").on(t.bizId, t.createdAt),
  index("comment_events_page_post").on(t.pageId, t.postId),
]);

// ---------- Social: scheduled posts (đăng bài tự động) ----------
export const scheduledPosts = pgTable("scheduled_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  connectionId: uuid("connection_id").references(() => connections.id, { onDelete: "cascade" }).notNull(),
  pageId: varchar("page_id", { length: 40 }).notNull(),
  message: text("message").notNull(),
  linkUrl: text("link_url"),
  photos: jsonb("photos").$type<string[]>().default([]).notNull(), // public URLs ảnh
  videoUrl: text("video_url"),
  mode: varchar("mode", { length: 20 }).default("schedule").notNull(), // now|schedule|draft
  scheduledAt: timestamp("scheduled_at"), // >= 10 phút & <= 30 ngày (giới hạn Meta)
  status: varchar("status", { length: 20 }).default("scheduled").notNull(), // draft|scheduled|publishing|published|failed|cancelled
  postId: varchar("post_id", { length: 60 }),
  publishError: text("publish_error"),
  aiPolicyCheck: jsonb("ai_policy_check").$type<{ ok: boolean; reason?: string; model?: string }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
}, (t) => [index("scheduled_posts_biz").on(t.bizId, t.status, t.scheduledAt)]);

// ---------- n8n / outbound webhooks (event bus ra ngoài) ----------
export const outboundWebhooks = pgTable("outbound_webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  url: text("url").notNull(), // n8n Webhook URL: https://<n8n-host>/webhook/<path>
  secret: varchar("secret", { length: 120 }), // optional — kèm header X-AdsSync-Secret
  events: jsonb("events").$type<string[]>().default([]).notNull(), // đăng ký nhận loại event nào
  enabled: boolean("enabled").default(true).notNull(),
  lastStatus: varchar("last_status", { length: 20 }), // ok|error
  lastError: text("last_error"),
  lastFiredAt: timestamp("last_fired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("outbound_webhooks_biz").on(t.bizId)]);

export const outboundEventLogs = pgTable("outbound_event_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  webhookId: uuid("webhook_id").references(() => outboundWebhooks.id, { onDelete: "cascade" }),
  event: varchar("event", { length: 60 }).notNull(),
  ok: boolean("ok").default(true).notNull(),
  statusCode: integer("status_code"),
  latencyMs: integer("latency_ms"),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("outbound_event_logs_biz").on(t.bizId, t.createdAt)]);

// ---------- Support threads (báo lỗi / góp ý / câu hỏi) ----------
export const supportThreads = pgTable("support_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 20 }).default("support").notNull(), // bug|feature|support
  subject: varchar("subject", { length: 200 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).default("new").notNull(), // new|seen|resolved
  adminReply: text("admin_reply"),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("support_threads_biz").on(t.bizId, t.status, t.lastMessageAt)]);

// ---------- Notifications (in-app) ----------
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // null = mọi thành viên
  kind: varchar("kind", { length: 40 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body"),
  href: varchar("href", { length: 300 }),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("notifications_biz").on(t.bizId, t.readAt, t.createdAt)]);

// ---------- Announcements (admin -> mọi Biz) ----------
export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  level: varchar("level", { length: 20 }).default("info").notNull(), // info|warning|critical
  active: boolean("active").default(true).notNull(),
  startsAt: timestamp("starts_at").defaultNow().notNull(),
  endsAt: timestamp("ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Custom tools (Tool SDK: manifest + HTTP runner) ----------
export const customTools = pgTable("custom_tools", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),        // snake_case, dùng làm tên tool cho AI
  description: text("description").default("").notNull(), // quyết định AI có gọi tool hay không
  inputSchema: jsonb("input_schema").$type<{
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  }>().default({ type: "object", properties: {}, required: [] }).notNull(),
  // Chỉ hỗ trợ HTTP (không thực thi code tuỳ ý trên máy người dùng)
  method: varchar("method", { length: 10 }).default("GET").notNull(), // GET|POST|PUT|PATCH|DELETE
  url: text("url").notNull(), // hỗ trợ {{arg}} placeholder
  headers: jsonb("headers").$type<Record<string, string>>().default({}).notNull(),
  bodyTemplate: text("body_template"), // JSON string với {{arg}} placeholder
  secretRef: varchar("secret_ref", { length: 80 }), // tên biến môi trường cho header Authorization
  requiresApproval: boolean("requires_approval").default(true).notNull(), // tool có side effect
  enabled: boolean("enabled").default(true).notNull(),
  timeoutMs: integer("timeout_ms").default(10_000).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("custom_tool_biz_name").on(t.bizId, t.name)]);

// ---------- Ad metric views (mỗi người, mỗi nền tảng) ----------
export const adMetricViews = pgTable("ad_metric_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  platform: varchar("platform", { length: 20 }).notNull(), // meta|tiktok|google|openai_ads
  columns: jsonb("columns").$type<string[]>().default([]).notNull(),
  highlights: jsonb("highlights").$type<string[]>().default([]).notNull(),
  mergeAccounts: boolean("merge_accounts").default(true).notNull(),
  defaultLevel: varchar("default_level", { length: 10 }).default("campaign").notNull(),
  customFields: jsonb("custom_fields").$type<{
    key: string; name: string; formula: string; format: string; decimals: number;
  }[]>().default([]).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("ad_view_user_platform").on(t.bizId, t.userId, t.platform)]);

// ---------- OAuth 2.1 cho MCP (AI khác kết nối trực tiếp) ----------
// ChatGPT, Claude và các MCP client khác dùng OAuth 2.1 khi kết nối remote
// MCP server. Mỗi client đăng ký một dòng; mỗi lần cấp quyền sinh một
// access token gắn với user + biz để mcp server biết gọi tool của ai.
export const mcpOauthClients = pgTable("mcp_oauth_clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: varchar("client_id", { length: 120 }).notNull().unique(),
  clientSecretHash: varchar("client_secret_hash", { length: 64 }).notNull(),
  clientName: varchar("client_name", { length: 120 }),
  redirectUris: jsonb("redirect_uris").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mcpOauthTokens = pgTable("mcp_oauth_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: varchar("client_id", { length: 120 }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  // key gốc tương ứng — token dùng đúng quyền + bộ chỉ số + skill của key đó.
  keyId: uuid("key_id").references(() => mcpKeys.id, { onDelete: "cascade" }).notNull(),
  accessTokenHash: varchar("access_token_hash", { length: 64 }).notNull().unique(),
  refreshTokenHash: varchar("refresh_token_hash", { length: 64 }),
  scope: varchar("scope", { length: 200 }).default("mcp:read").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mcpOauthCodes = pgTable("mcp_oauth_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  codeHash: varchar("code_hash", { length: 64 }).notNull().unique(),
  clientId: varchar("client_id", { length: 120 }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  keyId: uuid("key_id").references(() => mcpKeys.id, { onDelete: "cascade" }).notNull(),
  redirectUri: text("redirect_uri").notNull(),
  scope: varchar("scope", { length: 200 }).default("mcp:read").notNull(),
  codeChallenge: varchar("code_challenge", { length: 128 }),
  codeChallengeMethod: varchar("code_challenge_method", { length: 10 }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// ALL-IN-ONE MARKETING OS: CONTENT, SITES, CREATIVE & ATTRIBUTION
// ============================================================================

// ---------- 1. Sites / Headless CMS Destinations ----------
export const sites = pgTable("sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  type: varchar("type", { length: 40 }).notNull(), // wordpress|ghost|webflow|webhook|custom
  endpointUrl: text("endpoint_url").notNull(),
  authType: varchar("auth_type", { length: 40 }).default("application_password").notNull(), // application_password|bearer|api_key
  credentialsEnc: text("credentials_enc").notNull(), // encrypted JSON { username, appPassword, token }
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(), // defaultCategory, authorId, customHeaders
  status: varchar("status", { length: 20 }).default("active").notNull(), // active|disabled|error
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("sites_biz").on(t.bizId)]);

// ---------- 2. Topical Clusters (SEO Topic Clusters & Pillar Map) ----------
export const topicClusters = pgTable("topic_clusters", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  pillarKeyword: varchar("pillar_keyword", { length: 200 }).notNull(),
  searchVolume: integer("search_volume").default(0),
  intent: varchar("intent", { length: 40 }).default("informational").notNull(), // informational|commercial|transactional|navigational
  status: varchar("status", { length: 20 }).default("planning").notNull(), // planning|in_progress|completed
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("topic_clusters_biz").on(t.bizId, t.status)]);

// ---------- 3. Posts (Blog & Content Hub) ----------
export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  clusterId: uuid("cluster_id").references(() => topicClusters.id, { onDelete: "set null" }),
  postType: varchar("post_type", { length: 30 }).default("cluster").notNull(), // pillar|cluster|landing_page|ad_landing
  title: varchar("title", { length: 300 }).notNull(),
  slug: varchar("slug", { length: 300 }).notNull(),
  contentMarkdown: text("content_markdown").notNull(),
  contentHtml: text("content_html"),
  excerpt: text("excerpt"),
  featuredImageUrl: text("featured_image_url"),
  
  // Advanced On-page SEO & EEAT
  seoScore: integer("seo_score").default(0), // 0-100
  metaTitle: varchar("meta_title", { length: 160 }),
  metaDescription: varchar("meta_description", { length: 320 }),
  focusKeywords: jsonb("focus_keywords").$type<string[]>().default([]).notNull(),
  schemaGraph: jsonb("schema_graph").$type<Record<string, unknown>>().default({}).notNull(), // JSON-LD schema
  internalLinks: jsonb("internal_links").$type<Array<{ targetSlug: string; anchorText: string }>>().default([]).notNull(),
  
  // Status & Publishing
  status: varchar("status", { length: 20 }).default("draft").notNull(), // draft|review|scheduled|published|archived
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("posts_biz").on(t.bizId, t.status),
  uniqueIndex("posts_biz_slug").on(t.bizId, t.slug),
]);

// ---------- 4. Site Sync & Auto-Indexing Logs ----------
export const siteSyncLogs = pgTable("site_sync_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }).notNull(),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "cascade" }).notNull(),
  remotePostId: varchar("remote_post_id", { length: 80 }),
  remoteUrl: text("remote_url"),
  syncStatus: varchar("sync_status", { length: 20 }).default("success").notNull(), // success|failed
  indexingGoogleStatus: varchar("indexing_google_status", { length: 20 }).default("pending").notNull(), // pending|submitted|indexed|error
  indexingIndexNowStatus: varchar("indexing_indexnow_status", { length: 20 }).default("pending").notNull(), // pending|submitted|error
  errorLog: text("error_log"),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
}, (t) => [index("site_sync_logs_post").on(t.postId)]);

// ---------- 5. Creative Matrix (Angles, Hooks & Copy Frameworks) ----------
export const creativeMatrix = pgTable("creative_matrix", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  sourcePostId: uuid("source_post_id").references(() => posts.id, { onDelete: "set null" }),
  angle: varchar("angle", { length: 80 }).notNull(), // pain_point|transformation|case_study|fomo|contrarian
  framework: varchar("framework", { length: 40 }).notNull(), // PAS|AIDA|BAB|FAB
  headline: varchar("headline", { length: 255 }).notNull(),
  hooks: jsonb("hooks").$type<string[]>().default([]).notNull(), // 3-5 visual/text hooks
  bodyCopy: text("body_copy").notNull(),
  callToAction: varchar("call_to_action", { length: 120 }).notNull(),
  targetAudience: text("target_audience"),
  mediaAssetUrls: jsonb("media_asset_urls").$type<string[]>().default([]).notNull(),
  status: varchar("status", { length: 20 }).default("draft").notNull(), // draft|ready|testing|archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [index("creative_matrix_biz").on(t.bizId)]);

// ---------- 6. Server-Side Conversions & Attribution (CAPI Hub) ----------
export const conversionEvents = pgTable("conversion_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  bizId: uuid("biz_id").references(() => bizs.id, { onDelete: "cascade" }).notNull(),
  orderId: varchar("order_id", { length: 120 }).notNull(),
  orderNumber: varchar("order_number", { length: 80 }),
  revenue: bigint("revenue", { mode: "number" }).notNull(), // Số tiền thực (VNĐ)
  currency: varchar("currency", { length: 10 }).default("VND").notNull(),
  
  // Hashed User Data (SHA-256) for Meta CAPI & Google Offline
  customerEmailSha256: varchar("customer_email_sha256", { length: 64 }),
  customerPhoneSha256: varchar("customer_phone_sha256", { length: 64 }),
  customerName: varchar("customer_name", { length: 160 }),
  
  // Source Attribution
  sourcePlatform: varchar("source_platform", { length: 40 }).default("direct"), // meta|google|tiktok|direct|organic
  utmSource: varchar("utm_source", { length: 120 }),
  utmMedium: varchar("utm_medium", { length: 120 }),
  utmCampaign: varchar("utm_campaign", { length: 120 }),
  fbp: varchar("fbp", { length: 120 }),
  fbc: varchar("fbc", { length: 120 }),
  gclid: text("gclid"),
  
  // CAPI Dispatch Status
  metaCapiStatus: varchar("meta_capi_status", { length: 20 }).default("pending").notNull(), // pending|sent|failed|skipped
  googleOfflineStatus: varchar("google_offline_status", { length: 20 }).default("pending").notNull(), // pending|sent|failed|skipped
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("conv_biz_order").on(t.bizId, t.orderId),
  index("conv_biz_created").on(t.bizId, t.createdAt),
]);

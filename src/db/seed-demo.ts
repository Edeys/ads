// Seed dữ liệu demo để phát triển/verify mà không cần tài khoản thật.
// Run: npx tsx src/db/seed-demo.ts
import { db, schema } from "./index";
import { and, eq } from "drizzle-orm";
import { encryptSecret } from "../lib/crypto";

const DEMO = [
  {
    provider: "meta_ads",
    name: "Meta Ads (demo)",
    secret: { access_token: "mock_meta_token" },
    meta: {
      mock: true,
      adAccounts: [
        { id: "act_100000000000001", name: "Demo VND · TK01", currency: "VND", status: 1 },
        { id: "act_100000000000002", name: "Demo VND · TK02", currency: "VND", status: 1 },
      ],
      pages: [{ id: "page_demo_1", name: "Trang Demo" }],
    },
  },
  {
    provider: "tiktok_ads",
    name: "TikTok Ads (demo)",
    secret: { access_token: "mock_tiktok_token" },
    meta: {
      mock: true,
      advertisers: [{ advertiser_id: "700000000000001", advertiser_name: "TikTok Demo", currency: "VND" }],
    },
  },
  {
    provider: "google_ads",
    name: "Google Ads (demo)",
    secret: { access_token: "mock_google_token" },
    meta: {
      mock: true,
      customerId: "123-456-7890",
      customerName: "Google Demo",
      customers: [{ id: "1234567890", name: "Google Demo", currency: "VND" }],
    },
  },
  {
    provider: "openai_ads",
    name: "OpenAI Ads (demo)",
    secret: { access_token: "mock_openai_token" },
    meta: {
      mock: true,
      adAccounts: [{ id: "openai_demo_1", name: "OpenAI Demo", currency: "USD" }],
    },
  },
];

async function main() {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, "dev@local.test")).limit(1);
  if (!user) throw new Error("Chạy npm run seed trước.");
  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.slug, "my-biz")).limit(1);
  if (!biz) throw new Error("Chưa có biz my-biz — chạy npm run seed trước.");

  const conns = await db.select().from(schema.connections).where(eq(schema.connections.bizId, biz.id));
  for (const d of DEMO) {
    if (conns.some((c) => c.provider === d.provider)) {
      console.log("[demo] bỏ qua", d.provider);
      continue;
    }
    await db.insert(schema.connections).values({
      bizId: biz.id,
      provider: d.provider,
      name: d.name,
      secret: { enc: encryptSecret(d.secret) },
      meta: d.meta as any,
      health: "ok",
      lastCheckedAt: new Date(),
    });
    console.log("[demo] connection", d.provider);
  }

  // Support threads
  const threads = await db.select().from(schema.supportThreads).where(eq(schema.supportThreads.bizId, biz.id)).limit(1);
  if (!threads[0]) {
    await db.insert(schema.supportThreads).values([
      { bizId: biz.id, userId: user.id, kind: "bug", subject: "Bảng chỉ số chưa cộng đúng tổng", message: "Tổng theo tài khoản bị lệch vài đồng.", status: "new" },
      { bizId: biz.id, userId: user.id, kind: "feature", subject: "Muốn thêm cột ROAS", message: "Cho em xin thêm cột ROAS vào bảng chỉ số.", status: "seen" },
      { bizId: biz.id, userId: user.id, kind: "support", subject: "Cách nối TikTok Ads", message: "Em cần hướng dẫn nối tài khoản TikTok.", status: "resolved" },
    ]);
    console.log("[demo] support threads");
  }

  // Notifications + announcement
  const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.bizId, biz.id)).limit(1);
  if (!notes[0]) {
    await db.insert(schema.notifications).values([
      { bizId: biz.id, userId: user.id, kind: "report", title: "Báo cáo tuần đã sẵn sàng", href: "/biz/my-biz/dashboard/reports" },
      { bizId: biz.id, userId: user.id, kind: "connection", title: "Kết nối Meta sắp hết hạn", body: "Gia hạn trong 3 ngày tới.", href: "/biz/my-biz/dashboard/connections" },
    ]);
    console.log("[demo] notifications");
  }
  const ann = await db.select().from(schema.announcements).limit(1);
  if (!ann[0]) {
    await db.insert(schema.announcements).values({
      title: "Chào mừng tới AdsSync",
      body: "Bản self-hosted đang chạy với dữ liệu demo.",
      level: "info",
    });
    console.log("[demo] announcement");
  }

  // MCP keys + call logs (để nhóm MCP trong Reports có số)
  const keys = await db.select().from(schema.mcpKeys).where(eq(schema.mcpKeys.bizId, biz.id));
  let keyId = keys[0]?.id;
  if (!keyId) {
    const [k] = await db.insert(schema.mcpKeys).values({
      bizId: biz.id,
      name: "Claude Desktop (demo)",
      keyHash: "demo-hash",
      keyPrefix: "mcp_demo",
      scopes: { meta_ads: "read", tiktok_ads: "read", write: "false" },
    }).returning();
    keyId = k.id;
    console.log("[demo] mcp key");
  }
  const logs = await db.select().from(schema.mcpCallLogs).where(eq(schema.mcpCallLogs.keyId, keyId)).limit(1);
  if (!logs[0]) {
    const now = Date.now();
    const tools = ["meta_get_ad_accounts", "meta_get_insights", "tiktok_get_ad_accounts", "meta_get_campaign_details", "meta_get_pages"];
    await db.insert(schema.mcpCallLogs).values(
      tools.map((tool, i) => ({
        keyId: keyId!,
        tool,
        latencyMs: [420, 1660, 380, 1250, 210][i],
        ok: i !== 3,
        createdAt: new Date(now - i * 3_600_000),
      })),
    );
    console.log("[demo] mcp call logs");
  }

  // Activity log mẫu
  const acts = await db.select().from(schema.activityLogs).where(eq(schema.activityLogs.bizId, biz.id)).limit(1);
  if (!acts[0]) {
    await db.insert(schema.activityLogs).values([
      { bizId: biz.id, actorId: user.id, action: "connection.create", objectType: "connection", objectId: "demo", detail: { provider: "meta_ads" } },
      { bizId: biz.id, actorId: user.id, action: "ad_view.update", objectType: "ad_view", objectId: "meta", detail: { columns: 7 } },
      { bizId: biz.id, actorId: user.id, action: "member.invite", objectType: "member", objectId: "demo", detail: { email: "teammate@example.com" } },
    ]);
    console.log("[demo] activity logs");
  }

  console.log("[demo] done");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

// Meta connect bước 2 — popup FB SDK (kiểu Done.vn "click là kết nối").
//
// Client chạy FB.login() ngay trong trang (không redirect rời app), gửi
// authResponse lên đây. Server đổi long-lived token, quét ad accounts + pages
// (tái dùng checkHealth), kiểm quota, rồi trả bước "select_accounts" kèm
// pending_id. Route confirm mới thực sự lưu connection.
//
// Sandbox: khi ADSYNC_MOCK bật (mặc định), body {mock:true} hoặc token "mock_*"
// chạy toàn bộ luồng với dữ liệu giả — để test UI mà không cần app Facebook thật.
import { randomUUID } from "crypto";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { checkHealth } from "@/lib/providers";
import { grantedKeys, missingScopes } from "@/lib/oauth-scopes";
import { countAdAccounts, getBizPlan, quotasEnforced, type Quota } from "@/lib/plan-quota";
import { savePendingConnect } from "@/lib/connect-pending";
import { mockMode } from "@/lib/self-hosted-config";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

const GRAPH = "https://graph.facebook.com/v21.0";

const MOCK_META = {
  profile: { id: "mock_fb_user", name: "Sandbox Facebook" },
  adAccounts: [
    { id: "act_1029384756", name: "TKQC Sandbox Chính - VND", status: 1, currency: "VND", timezone: "Asia/Ho_Chi_Minh", businessId: null },
    { id: "act_5647382910", name: "TKQC Sandbox Phụ - USD", status: 1, currency: "USD", timezone: "Asia/Ho_Chi_Minh", businessId: null },
  ],
  pages: [
    { id: "987654321", name: "Page Sandbox Bán Hàng", category: "Shopping", link: null, hasInstagram: false },
    { id: "123456789", name: "Page Sandbox Thương Hiệu", category: "Brand", link: null, hasInstagram: false },
  ],
  businesses: [],
  pixels: [],
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug ?? "");
  const m = slug ? await getMembership(slug) : null;
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const wantMock = body.mock === true || String(body.access_token ?? "").startsWith("mock_");
  if (wantMock && !mockMode()) {
    return Response.json({ error: "Sandbox đã tắt (ADSYNC_MOCK=0) — dùng luồng đăng nhập thật." }, { status: 400 });
  }

  const shortToken = String(body.access_token ?? "");
  if (!wantMock && !shortToken) return Response.json({ error: "Thiếu access_token." }, { status: 400 });

  let accessToken = shortToken;
  let granted: string[] = [];
  let metaData: Record<string, unknown>;

  if (wantMock) {
    accessToken = accessToken || `mock_meta_access_tok_${Date.now()}`;
    metaData = { ...MOCK_META, grantedScopes: ["ads_read", "ads_management", "pages_show_list", "pages_read_engagement"] };
    granted = metaData.grantedScopes as string[];
  } else {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!appId || !appSecret) {
      return Response.json({ error: "Chưa cấu hình META_APP_ID/META_APP_SECRET." }, { status: 503 });
    }
    // SDK trả short-lived token (~2 giờ) — đổi long-lived (~60 ngày).
    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`,
    ).then((r) => r.json()).catch(() => ({}));
    if (longRes.access_token) accessToken = longRes.access_token;
    granted = grantedKeys("meta", (longRes.scope ?? body.granted_scopes ?? "") as string);
    // checkHealth quét ad accounts (kể cả qua business), pages, pixels và
    // đối chiếu scope thực tế của token qua debug_token.
    const health = await checkHealth({ provider: "meta_ads", secret: { access_token: accessToken }, meta: {} });
    if (health.health === "dead") {
      return Response.json({ error: "Token không hợp lệ hoặc đã bị thu hồi." }, { status: 400 });
    }
    metaData = health.meta ?? {};
  }

  const missing = missingScopes("meta", granted);
  const adAccounts = (metaData.adAccounts as typeof MOCK_META.adAccounts) ?? [];
  const pages = (metaData.pages as typeof MOCK_META.pages) ?? [];
  const profile = (metaData.profile as { id: string; name?: string }) ?? { id: String(body.user_id ?? ""), name: "" };

  // Chỉ cập nhật lại khi CÙNG Facebook user (khớp meta.profile.id). Tuyệt đối
  // không đoán theo "connection Meta duy nhất" — ghi đè connection thật bằng
  // token khác (ví dụ sandbox) là mất token thật của owner.
  const existingRows = await db
    .select({ id: schema.connections.id, meta: schema.connections.meta })
    .from(schema.connections)
    .where(and(eq(schema.connections.bizId, m.biz.id), eq(schema.connections.provider, "meta_ads")));
  const matched = existingRows.find((r) => (r.meta as Record<string, unknown>)?.profile && ((r.meta as any).profile?.id === profile.id));
  const existingId = matched?.id ?? null;
  const connectedIds = new Set<string>(
    existingRows.flatMap((r) => (((r.meta as any)?.adAccounts as { id: string }[]) ?? []).map((a) => a.id)),
  );

  let quota: Quota | null = null;
  let used = 0;
  if (quotasEnforced()) {
    const plan = await getBizPlan(m.biz.id);
    quota = plan.quota;
    used = await countAdAccounts(m.biz.id);
  }
  const remaining = quota ? Math.max(0, quota.tkqc - used) : null;

  const pending = savePendingConnect({
    id: randomUUID(),
    bizId: m.biz.id,
    provider: "meta_ads",
    name: String(body.name ?? profile.name ?? "Meta Ads"),
    secret: { access_token: accessToken },
    meta: metaData,
    adAccounts,
    pages,
    existingId,
  });

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "connection.pending_select",
    objectType: "connection",
    objectId: pending.id,
    detail: { provider: "meta_ads", via: wantMock ? "oauth_sandbox" : "oauth_popup", accountsFound: adAccounts.length, pagesFound: pages.length },
  });

  return Response.json({
    status: "select_accounts",
    pending_id: pending.id,
    profile,
    ad_accounts: adAccounts.map((a) => ({ ...a, connected: connectedIds.has(a.id) })),
    pages,
    quota: { used, limit: quota?.tkqc ?? null, remaining, enforced: Boolean(quota) },
    existing_connection_id: existingId,
    missing_scopes: missing.map((s) => s.key),
  });
}

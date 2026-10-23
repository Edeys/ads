// GET /api/self-hosted/oauth-config/test?provider=meta|google|tiktok
//
// Kiểm tra trực tiếp cấu hình OAuth bằng API của nhà cung cấp:
//  - Meta: xác thực App ID/Secret bằng app access token, đọc tên app + danh sách
//    vai trò (admin/developer/tester). Đây là thứ quyết định ai đăng nhập được
//    khi app còn ở Development mode.
//  - Google: kiểm tra sự hiện diện của Developer Token và gọi thử
//    customers:listAccessibleCustomers qua kết nối Google Ads đã có.
//  - TikTok: chỉ kiểm tra cấu hình; cổng developer chưa có API kiểm tra công khai.
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { googleAdsAuth } from "@/lib/google-ads";
import { requestAppUrl, requestRedirectUri } from "@/lib/self-hosted-config";
import { defaultScopeKeys, scopeString } from "@/lib/oauth-scopes";

export const runtime = "nodejs";

type Check = { ok: boolean; label: string; detail: string };
type Link = { label: string; href: string };

async function guard() {
  if (process.env.SELF_HOSTED !== "true") return null;
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;
  const rows = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(and(eq(schema.members.userId, userId), eq(schema.members.role, "owner")))
    .limit(1);
  if (rows.length === 0) return null;
  return { userId };
}

async function graph(path: string) {
  const appId = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!appId || !secret) return { error: "missing_credentials" as const };
  const token = `${appId}|${secret}`;
  const url = `https://graph.facebook.com/v21.0/${appId}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      return { error: "graph_error" as const, message: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { data: json };
  } catch (e: any) {
    return { error: "network" as const, message: e?.message ?? "Không gọi được Graph API" };
  }
}

async function checkMeta(req: Request) {
  const appId = process.env.META_APP_ID ?? "";
  const secret = process.env.META_APP_SECRET ?? "";
  const checks: Check[] = [];
  const links: Link[] = [
    { label: "Meta App Dashboard", href: appId ? `https://developers.facebook.com/apps/${appId}/dashboard/` : "https://developers.facebook.com/apps/" },
    { label: "Facebook Login settings", href: appId ? `https://developers.facebook.com/apps/${appId}/fb-login/settings/` : "https://developers.facebook.com/apps/" },
    { label: "Vai trò / Testers", href: appId ? `https://developers.facebook.com/apps/${appId}/roles/` : "https://developers.facebook.com/apps/" },
    { label: "App Review", href: appId ? `https://developers.facebook.com/apps/${appId}/app-review/` : "https://developers.facebook.com/apps/" },
    { label: "Business Settings", href: "https://business.facebook.com/settings/apps" },
  ];

  checks.push({
    ok: Boolean(appId && secret),
    label: "App ID & App Secret",
    detail: appId && secret ? `Đã cấu hình app ${appId}.` : "Thiếu META_APP_ID hoặc META_APP_SECRET.",
  });

  if (!appId || !secret) {
    return { provider: "meta", checks, links, appName: null, roles: [], redirectUri: `${requestRedirectUri(req, "meta")}` };
  }

  const info = await graph("?fields=id,name,link,app_domains");
  const roles = await graph("/roles?limit=50");
  const appName = info.data?.name ?? null;
  const appLink = info.data?.link ?? null;
  const domains: string[] = Array.isArray(info.data?.app_domains) ? info.data.app_domains : [];
  const roleRows: { user: string; role: string }[] = Array.isArray(roles.data?.data) ? roles.data.data : [];

  checks.push({
    ok: Boolean(info.data),
    label: "Xác thực App ID/Secret",
    detail: info.data
      ? `Graph API chấp nhận cặp khóa. Ứng dụng: ${appName ?? appId}${appLink ? ` · ${appLink}` : ""}.`
      : info.error === "graph_error"
        ? `Facebook từ chối cặp App ID/Secret: ${info.message}`
        : `Không gọi được Graph API: ${info.message ?? info.error}`,
  });

  checks.push({
    ok: roleRows.length > 0,
    label: "Vai trò được phép đăng nhập (Development mode)",
    detail:
      roleRows.length === 0
        ? "Không đọc được danh sách vai trò. Nếu app ở Development mode, hãy thêm tài khoản Facebook vào Roles → Testers."
        : `Có ${roleRows.length} vai trò: ${roleRows.map((r) => `${r.role} (${r.user})`).join(", ")}. Chỉ các user này đăng nhập được khi app ở Development mode.`,
  });

  checks.push({
    ok: true,
    label: "Redirect URI cần đăng ký",
    detail: `${requestRedirectUri(req, "meta")}`,
  });

  const metaScopes = scopeString("meta", defaultScopeKeys("meta"));
  checks.push({
    ok: !metaScopes.includes("read_insights"),
    label: "Scope mặc định",
    detail: `${metaScopes} — read_insights đã bị Meta bỏ nên không còn được gửi.`,
  });

  checks.push({
    ok: domains.length > 0,
    label: "App Domains",
    detail:
      domains.length > 0
        ? `Đã khai: ${domains.join(", ")}.`
        : "Chưa khai App Domains. Không bắt buộc cho OAuth local, nhưng nên thêm xuanloi.me trước khi chuyển app sang Live. Meta đang tắt thay đổi app settings qua API (lỗi #10); muốn app tự cấu hình, bật Settings → Advanced → Allow API access to app settings, còn không thì khai tay trong App Dashboard.",
  });

  checks.push({
    ok: true,
    label: "Quyền & phạm vi người dùng",
    detail:
      "Bộ cơ bản (ads_read, ads_management, pages_show_list, pages_read_engagement) dùng được ngay với Admin/Tester khi app ở Development mode. " +
      "Muốn khách hàng bên ngoài kết nối, app phải chuyển Live và xin Advanced Access (App Review) cho từng quyền; " +
      "pages_manage_posts, pages_manage_engagement, publish_video, pages_messaging luôn cần App Review.",
  });

  return {
    provider: "meta",
    checks,
    links,
    appName,
    roles: roleRows,
    redirectUri: `${requestRedirectUri(req, "meta")}`,
  };
}

async function checkGoogle(req: Request, userId: string) {
  const checks: Check[] = [];
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const links: Link[] = [
    { label: "Google Ads API Center", href: "https://ads.google.com/manager/api/" },
    { label: "OAuth consent screen", href: "https://console.cloud.google.com/apis/credentials/consent" },
    { label: "OAuth credentials", href: "https://console.cloud.google.com/apis/credentials" },
  ];

  checks.push({
    ok: Boolean(clientId && clientSecret),
    label: "OAuth Client ID & Secret",
    detail: clientId && clientSecret ? "Đã cấu hình." : "Thiếu Client ID hoặc Client Secret.",
  });
  checks.push({
    ok: Boolean(developerToken),
    label: "Developer Token",
    detail: developerToken
      ? "Đã cấu hình. Token này là header bắt buộc của Google Ads API."
      : "Chưa có. Đây là lý do OAuth thành công nhưng không đọc được tài khoản. Gửi yêu cầu tại ads.google.com/manager/api (duyệt thủ công, vài ngày).",
  });

  // Tìm một kết nối Google Ads thuộc các Biz mà user là owner để gọi thử API.
  const [conn] = await db
    .select({ id: schema.connections.id })
    .from(schema.connections)
    .innerJoin(schema.members, eq(schema.members.bizId, schema.connections.bizId))
    .where(and(eq(schema.members.userId, userId), eq(schema.connections.provider, "google_ads")))
    .limit(1);

  if (!conn) {
    checks.push({
      ok: false,
      label: "Gọi thử Google Ads API",
      detail: "Chưa có kết nối Google Ads. Hãy kết nối OAuth trước, sau đó bấm kiểm tra lại.",
    });
  } else {
    let detail = "";
    let ok = false;
    try {
      const authInfo = await googleAdsAuth(conn.id);
      if (!authInfo.developerToken) {
        detail = "Kết nối chưa có Developer Token nên không thể gọi API.";
      } else {
        const res = await fetch("https://googleads.googleapis.com/v25/customers:listAccessibleCustomers", {
          headers: {
            Authorization: `Bearer ${authInfo.token}`,
            "developer-token": authInfo.developerToken,
            ...(authInfo.loginCustomerId ? { "login-customer-id": authInfo.loginCustomerId.replace(/-/g, "") } : {}),
          },
          signal: AbortSignal.timeout(15_000),
        });
        const json: any = await res.json().catch(() => ({}));
        if (res.ok && !json.error) {
          const names: string[] = Array.isArray(json.resourceNames) ? json.resourceNames : [];
          ok = true;
          detail = `API chấp nhận token. Truy cập được ${names.length} tài khoản${names.length ? `: ${names.slice(0, 5).join(", ")}` : ""}.`;
        } else {
          detail = `Google Ads API từ chối: ${json?.error?.message ?? `HTTP ${res.status}`}`;
        }
      }
    } catch (e: any) {
      detail = e?.message ?? "Không gọi được Google Ads API.";
    }
    checks.push({ ok, label: "Gọi thử Google Ads API", detail });
  }

  checks.push({
    ok: true,
    label: "Redirect URI cần đăng ký",
    detail: `${requestAppUrl(req)}/api/connect/google/callback`,
  });

  const googleScopes = scopeString("google", defaultScopeKeys("google"));
  checks.push({
    ok: googleScopes.includes(" ") && !googleScopes.includes(","),
    label: "Scope OAuth",
    detail: `${googleScopes} — Google yêu cầu phân tách bằng dấu cách; adwords.readonly và adsense.readonly đã được bỏ để tránh invalid_scope.`,
  });

  // Gọi thử URL uỷ quyền của Google: nếu scope sai, Google redirect tới
  // /signin/oauth/error?invalid_scope ngay cả trước khi người dùng đăng nhập.
  if (clientId) {
    let ok = false;
    let detail = "";
    try {
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(`${requestAppUrl(req)}/api/connect/google/callback`)}` +
        `&response_type=code&scope=${encodeURIComponent(googleScopes)}&access_type=offline&include_granted_scopes=true&state=preflight`;
      const res = await fetch(authUrl, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      const location = res.headers.get("location") ?? "";
      const invalid = /oauth\/error/i.test(location) && /invalid_scope/i.test(decodeURIComponent(location));
      ok = !invalid;
      detail = invalid
        ? "Google từ chối scope (invalid_scope). Kiểm tra Google Ads API đã bật và scope đã khai trong OAuth consent screen."
        : "Google chấp nhận URL uỷ quyền (chuyển tới trang đăng nhập, không báo invalid_scope).";
    } catch (e: any) {
      detail = `Không gọi thử được Google OAuth: ${e?.message ?? e}`;
    }
    checks.push({ ok, label: "Google chấp nhận scope", detail });
  }
  checks.push({
    ok: true,
    label: "OAuth consent screen",
    detail:
      "Nếu consent screen đang Testing, chỉ email trong Test users đăng nhập được. " +
      "Mở link bên dưới để thêm email hoặc publish app.",
  });

  return { provider: "google", checks, links, appName: null, roles: [] };
}

async function checkTikTok(req: Request) {
  const id = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_APP_SECRET;
  const checks: Check[] = [
    {
      ok: Boolean(id && secret),
      label: "TikTok App ID & Secret",
      detail: id && secret ? "Đã cấu hình." : "Chưa có. TikTok chỉ hiện App ID/Secret sau khi app được duyệt.",
    },
    {
      ok: true,
      label: "Redirect URI cần đăng ký",
      detail: process.env.TIKTOK_REDIRECT_URL ?? `${requestAppUrl(req)}/api/connect/tiktok/callback`,
    },
    {
      ok: true,
      label: "Trạng thái app",
      detail: "TikTok duyệt app thủ công; trong thời gian chờ, OAuth sẽ báo lỗi. Không có API công khai để kiểm tra trạng thái.",
    },
  ];
  const links: Link[] = [{ label: "TikTok Developer Portal", href: "https://business-api.tiktok.com/portal/app" }];
  return { provider: "tiktok", checks, links, appName: null, roles: [] };
}

export async function GET(req: Request) {
  if (!(await guard())) return Response.json({ error: "forbidden" }, { status: 403 });
  const session = await auth();
  const userId = (session?.user as any)?.id as string;

  const provider = new URL(req.url).searchParams.get("provider") ?? "meta";
  try {
    if (provider === "meta") return Response.json(await checkMeta(req));
    if (provider === "google") return Response.json(await checkGoogle(req, userId));
    if (provider === "tiktok") return Response.json(await checkTikTok(req));
    return Response.json({ error: "provider_invalid" }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Không kiểm tra được cấu hình." }, { status: 500 });
  }
}

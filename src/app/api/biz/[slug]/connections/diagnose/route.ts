// Chẩn đoán cấu hình OAuth của nhà cung cấp.
//
// Mục tiêu: khi người dùng bấm "Kết nối" mà Meta/Google báo lỗi, họ cần biết
// chính xác phần nào còn thiếu thay vì mở lại app. Route này trả về checklist
// kiểm tra được: app id, redirect URI đang dùng, các scope yêu cầu, và các
// điều kiện kỹ thuật mà nhà cung cấp áp (Business Portfolio, Developer Token).
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import {
  PROVIDER_SCOPES,
  defaultScopeKeys,
  grantedKeys,
  type ScopeProvider,
} from "@/lib/oauth-scopes";
import { requestAppUrl, requestRedirectUri } from "@/lib/self-hosted-config";

export const runtime = "nodejs";

const CONNECTION_PROVIDER: Record<string, ScopeProvider> = {
  meta_ads: "meta",
  google_ads: "google",
  tiktok_ads: "tiktok",
  google_sheets: "sheets",
};

type Check = { ok: boolean; label: string; detail: string };

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") ?? "meta";
  const connId = url.searchParams.get("connectionId");

  const appUrl = requestAppUrl(req);
  const checks: Check[] = [];

  if (provider === "meta") {
    const appId = process.env.META_APP_ID;
    checks.push({
      ok: Boolean(appId),
      label: "Meta App ID",
      detail: appId ? `Đã cấu hình (${appId})` : "Thiếu META_APP_ID trong cấu hình ứng dụng OAuth.",
    });
    checks.push({
      ok: Boolean(process.env.META_APP_SECRET),
      label: "Meta App Secret",
      detail: process.env.META_APP_SECRET ? "Đã cấu hình" : "Thiếu META_APP_SECRET.",
    });
    checks.push({
      ok: true,
      label: "Redirect URI",
      detail:
        `Cần đăng ký đúng chuỗi này trong Meta App Settings → Valid OAuth Redirect URIs: ${requestRedirectUri(req, "meta")}. ` +
        "Nếu Facebook báo “không sử dụng kết nối bảo mật”, tắt Enforce HTTPS trong Facebook Login → Settings (khi app còn Development mode) hoặc dùng tunnel HTTPS.",
    });
    checks.push({
      ok: false,
      label: "Chế độ app & người dùng thử",
      detail:
        "Nếu app còn ở Development mode, chỉ Admin/Developer/Tester của app mới đăng nhập được; " +
        "tài khoản khác sẽ thấy \"Sorry, something went wrong\". Thêm tài khoản Facebook vào " +
        "Roles → Testers tại developers.facebook.com/apps/" + (appId ?? "{app-id}") + "/roles, hoặc chuyển app sang Live.",
    });
    checks.push({
      ok: false,
      label: "Business Portfolio",
      detail:
        "Quyền business_management chỉ được cấp khi app đã gắn Business Portfolio. " +
        "Không có portfolio thì Facebook báo \"Sorry, something went wrong\" cho cả dialog. " +
        "Trong Meta Business Settings, tạo portfolio rồi gắn app vào (Settings → Accounts → Apps).",
    });
    checks.push({
      ok: false,
      label: "Quyền cần duyệt",
      detail:
        "pages_manage_posts, pages_manage_engagement, publish_video, pages_messaging chỉ cấp được sau App Review " +
        "và khi app ở chế độ Live. Tới lúc đó các tính năng đăng bài / trả lời bình luận sẽ báo thiếu quyền.",
    });
  } else if (provider === "google") {
    checks.push({
      ok: Boolean(process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID),
      label: "Google Client ID",
      detail: process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID ? "Đã cấu hình" : "Thiếu GOOGLE_ADS_CLIENT_ID.",
    });
    checks.push({
      ok: Boolean(process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET),
      label: "Google Client Secret",
      detail: process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET ? "Đã cấu hình" : "Thiếu GOOGLE_ADS_CLIENT_SECRET.",
    });
    checks.push({
      ok: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
      label: "Google Ads Developer Token",
      detail: process.env.GOOGLE_ADS_DEVELOPER_TOKEN
        ? "Đã cấu hình."
        : "Thiếu Developer Token. Google Ads API bắt buộc có token này; không có thì OAuth vẫn thành công nhưng không đọc được tài khoản quảng cáo nào. Lấy token ở ads.google.com/manager/api (duyệt thủ công, vài ngày).",
    });
    checks.push({
      ok: true,
      label: "Redirect URI",
      detail: `Cần đăng ký trong Google Cloud Console → OAuth client: ${appUrl}/api/connect/google/callback`,
    });
    checks.push({
      ok: false,
      label: "OAuth consent screen",
      detail:
        "Nếu consent screen đang ở Testing, chỉ các email trong Test users mới đăng nhập được; " +
        "email khác bị chặn (access_blocked). Thêm email tại Google Cloud Console → APIs & Services → " +
        "OAuth consent screen → Test users, hoặc publish app.",
    });
    checks.push({
      ok: false,
      label: "MCC (login-customer-id)",
      detail:
        "Nếu truy vấn tài khoản con thuộc MCC, cần điền MCC id để gắn header login-customer-id. " +
        "Không có MCC thì chỉ truy vấn được tài khoản trực tiếp của người đăng nhập.",
    });
  } else if (provider === "tiktok") {
    checks.push({
      ok: Boolean(process.env.TIKTOK_APP_ID),
      label: "TikTok App ID",
      detail: process.env.TIKTOK_APP_ID ? "Đã cấu hình" : "Thiếu TIKTOK_APP_ID. App phải được duyệt thì mới hiện ID/Secret.",
    });
    checks.push({
      ok: Boolean(process.env.TIKTOK_APP_SECRET),
      label: "TikTok App Secret",
      detail: process.env.TIKTOK_APP_SECRET ? "Đã cấu hình" : "Thiếu TIKTOK_APP_SECRET.",
    });
  } else {
    checks.push({ ok: false, label: "Provider", detail: `Provider "${provider}" không hỗ trợ chẩn đoán OAuth.` });
  }

  // Trạng thái scope thực tế của connection (nếu có).
  let connection: {
    id: string;
    provider: string;
    name: string;
    health: string;
    granted: string[];
    missing: string[];
    accounts: number;
  } | null = null;

  if (connId) {
    const [conn] = await db.select().from(schema.connections).where(eq(schema.connections.id, connId)).limit(1);
    if (conn && conn.bizId === m.biz.id) {
      const meta = (conn.meta ?? {}) as Record<string, unknown>;
      const scopeProvider = CONNECTION_PROVIDER[conn.provider];
      const granted = scopeProvider ? grantedKeys(scopeProvider, (meta.grantedScopes as string[]) ?? []) : [];
      const defs = scopeProvider ? PROVIDER_SCOPES[scopeProvider] : [];
      connection = {
        id: conn.id,
        provider: conn.provider,
        name: conn.name,
        health: conn.health,
        granted,
        missing: defs.filter((s) => !granted.includes(s.key)).map((s) => s.key),
        accounts:
          ((meta.adAccounts as unknown[]) ?? []).length +
          ((meta.customers as unknown[]) ?? []).length +
          ((meta.advertisers as unknown[]) ?? []).length,
      };
    }
  }

  const scopeProvider = (provider === "google" ? "google" : provider === "tiktok" ? "tiktok" : "meta") as ScopeProvider;

  return Response.json({
    provider,
    appUrl,
    redirectUri:
      provider === "meta"
        ? requestRedirectUri(req, "meta")
        : `${appUrl}/api/connect/${provider === "google" ? "google" : provider === "tiktok" ? "tiktok" : "meta"}/callback`,
    requiredScopes: PROVIDER_SCOPES[scopeProvider].map((s) => ({ key: s.key, scope: s.scope, label: s.label, needsReview: s.needsReview })),
    defaultScopes: defaultScopeKeys(scopeProvider),
    checks,
    connection,
  });
}

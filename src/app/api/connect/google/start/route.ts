// Google OAuth — bước 1: redirect sang Google consent dialog.
//
// Một OAuth app dùng cho cả 3 nhóm dữ liệu:
//   • google_ads           → scope adwords (mặc định)
//   • search_console       → scope webmasters.readonly
//   • ga4                  → scope analytics.readonly
//
// Scope lấy từ registry src/lib/oauth-scopes.ts. State ký HMAC và mang theo
// `provider` + danh sách scope để callback biết phải tạo connection nào.
import { createHmac } from "crypto";
import { auth } from "@/lib/auth";
import { defaultScopeKeys, scopeString, type ScopeProvider } from "@/lib/oauth-scopes";

import { allowMockOAuth, requestAppUrl } from "@/lib/self-hosted-config";

export const runtime = "nodejs";

type GoogleFlow = "google_ads" | "search_console" | "ga4";

const FLOW: Record<GoogleFlow, { scopeProvider: ScopeProvider; label: string }> = {
  google_ads: { scopeProvider: "google", label: "Google Ads" },
  search_console: { scopeProvider: "search_console", label: "Google Search Console" },
  ga4: { scopeProvider: "ga4", label: "Google Analytics 4" },
};

function signState(payload: object) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev-secret").update(data).digest("base64url");
  return `${data}.${sig}`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!(session?.user as any)?.id && process.env.SELF_HOSTED !== "true") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const urlObj = new URL(req.url);
  const slug = urlObj.searchParams.get("slug") ?? "";
  const isDevMock = allowMockOAuth(req);
  const requested = (urlObj.searchParams.get("scope") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const rawProvider = urlObj.searchParams.get("provider") ?? "google_ads";
  const provider: GoogleFlow = rawProvider in FLOW ? (rawProvider as GoogleFlow) : "google_ads";
  const flow = FLOW[provider];

  const appUrl = requestAppUrl(req);
  const redirect = `${appUrl}/api/connect/google/callback`;
  const conn = urlObj.searchParams.get("conn") ?? "";
  const state = signState({ slug, conn, provider, ts: Date.now(), scope: requested });

  if (isDevMock) {
    return Response.redirect(`${redirect}?code=mock_google_code_${Date.now()}&state=${state}&mock=1`);
  }

  const clientId = clientIdOrNull();
  if (!clientId || !secretOrNull()) {
    return Response.json({
      error: "Chưa cấu hình GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Vào Cài đặt → Ứng dụng OAuth để nhập."
    }, { status: 503 });
  }

  const keys = requested.length ? requested : defaultScopeKeys(flow.scopeProvider);
  const scopes = scopeString(flow.scopeProvider, keys);
  const target = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&include_granted_scopes=true&prompt=consent&state=${state}`;

  return Response.redirect(target);
}

function clientIdOrNull() {
  return process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || null;
}
function secretOrNull() {
  return process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || null;
}

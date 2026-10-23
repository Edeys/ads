// Google Ads OAuth — bước 1: redirect sang Google consent dialog.
//
// Scope lấy từ registry src/lib/oauth-scopes.ts. Mặc định gồm adwords (đọc/ghi
// Google Ads) + openid + email để gắn đúng người dùng.
import { createHmac } from "crypto";
import { auth } from "@/lib/auth";
import { defaultScopeKeys, scopeString } from "@/lib/oauth-scopes";

import { allowMockOAuth, requestAppUrl } from "@/lib/self-hosted-config";

export const runtime = "nodejs";

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

  const appUrl = requestAppUrl(req);
  const redirect = `${appUrl}/api/connect/google/callback`;
  const conn = urlObj.searchParams.get("conn") ?? "";
  const state = signState({ slug, conn, ts: Date.now(), scope: requested });

  if (isDevMock) {
    return Response.redirect(`${redirect}?code=mock_google_ads_code_${Date.now()}&state=${state}&mock=1`);
  }

  const clientId = clientIdOrNull();
  if (!clientId || !secretOrNull()) {
    return Response.json({
      error: "Chưa cấu hình GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET. Vào Cài đặt → Ứng dụng OAuth để nhập."
    }, { status: 503 });
  }

  const keys = requested.length ? requested : defaultScopeKeys("google");
  const scopes = scopeString("google", keys);
  const target = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&include_granted_scopes=true&state=${state}`;

  return Response.redirect(target);
}

function clientIdOrNull() {
  return process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || null;
}
function secretOrNull() {
  return process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || null;
}

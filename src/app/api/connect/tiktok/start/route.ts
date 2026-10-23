// TikTok Ads OAuth — Bước 1: redirect sang TikTok Business API auth dialog.
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
  // TikTok không chấp nhận redirect URL dạng IP (127.0.0.1) — chỉ nhận hostname.
  // Cho phép override bằng TIKTOK_REDIRECT_URL (bản desktop đặt sẵn).
  const redirect = process.env.TIKTOK_REDIRECT_URL ?? `${appUrl}/api/connect/tiktok/callback`;
  const conn = urlObj.searchParams.get("conn") ?? "";
  const state = signState({ slug, conn, ts: Date.now(), scope: requested });

  if (isDevMock) {
    // Dev Sandbox mode: chuyển thẳng sang callback với mock code
    return Response.redirect(`${redirect}?auth_code=mock_tiktok_code_${Date.now()}&state=${state}&mock=1`);
  }

  const appId = process.env.TIKTOK_APP_ID;
  if (!appId || !process.env.TIKTOK_APP_SECRET) {
    return Response.json({
      error: "Chưa cấu hình TIKTOK_APP_ID/TIKTOK_APP_SECRET. Vào Cài đặt → Ứng dụng OAuth để nhập sau khi TikTok duyệt app."
    }, { status: 503 });
  }

  const keys = requested.length ? requested : defaultScopeKeys("tiktok");
  const scopes = scopeString("tiktok", keys);
  const target = `https://business-api.tiktok.com/portal/auth?app_id=${appId}&state=${state}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(scopes)}`;
  return Response.redirect(target);
}

// Meta OAuth — bước 1: redirect sang Facebook dialog.
//
// Scope lấy từ registry src/lib/oauth-scopes.ts (không hardcode trong route).
// Người dùng có thể chọn nhóm quyền cần cấp qua ?scope=keys (phân tách dấu phẩy);
// không truyền thì lấy scope mặc định (đọc + ghi quảng cáo).
import { createHmac } from "crypto";
import { auth } from "@/lib/auth";
import { defaultScopeKeys, scopeString } from "@/lib/oauth-scopes";

import { allowMockOAuth, requestRedirectUri } from "@/lib/self-hosted-config";

export const runtime = "nodejs";

function signState(payload: object) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev-secret").update(data).digest("base64url");
  return `${data}.${sig}`;
}

export async function GET(req: Request) {
  // Bản desktop mở OAuth trong trình duyệt hệ thống — trình duyệt này có thể
  // không chia sẻ cookie phiên với WebView. Bản self-hosted chỉ bind 127.0.0.1
  // nên cho phép khởi động OAuth mà không cần phiên; state vẫn được ký HMAC và
  // người dùng vẫn phải đăng nhập/đồng ý ở Facebook.
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

  const redirect = requestRedirectUri(req, "meta");
  const conn = urlObj.searchParams.get("conn") ?? "";
  const state = signState({ slug, conn, ts: Date.now(), scope: requested });

  if (isDevMock) {
    return Response.redirect(`${redirect}?code=mock_meta_oauth_code_${Date.now()}&state=${state}&mock=1`);
  }

  const appId = process.env.META_APP_ID;
  if (!appId || !process.env.META_APP_SECRET) {
    return Response.json({ error: "Chưa cấu hình META_APP_ID/META_APP_SECRET. Vào Cài đặt → Ứng dụng OAuth để nhập, hoặc dùng Access Token thủ công." }, { status: 503 });
  }

  const keys = requested.length ? requested : defaultScopeKeys("meta");
  const scopes = scopeString("meta", keys);
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&scope=${encodeURIComponent(scopes)}`;
  return Response.redirect(url);
}

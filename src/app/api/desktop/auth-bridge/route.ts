// Tạo "cầu nối" đăng nhập cho bản desktop.
//
// POST /api/desktop/auth-bridge          → tạo mã + trả về URL cần mở ở trình duyệt hệ thống
// GET  /api/desktop/auth-bridge/status   → webview poll; khi đã đăng nhập xong thì trả cookie phiên
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { authBaseUrl } from "@/lib/self-hosted-config";
import { isLoginProvider } from "@/lib/login-providers";

import { isLoopbackRequest, loopbackForbidden } from "@/lib/request-origin";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 10 * 60 * 1000; // 10 phút

/** Tạo mã bridge và URL đăng nhập (mở ở trình duyệt hệ thống). */
export async function POST(req: Request) {
  if (!isLoopbackRequest(req)) return loopbackForbidden();
  const rl = rateLimit(clientKey(req, "auth_bridge"), 60, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  // Luồng đăng nhập dùng origin của NextAuth (localhost) — xem authBaseUrl().
  const origin = authBaseUrl();
  const id = randomBytes(24).toString("base64url");

  const urlObj = new URL(req.url);
  const providerParam = urlObj.searchParams.get("provider");
  const provider = isLoginProvider(providerParam) ? providerParam : "google";

  await db.insert(schema.desktopAuthBridges).values({
    id,
    expiresAt: new Date(Date.now() + TTL_MS),
  });

  const callback = `${origin}/api/auth/bridge?code=${id}`;
  // NextAuth v5 cần POST + csrfToken, nên ta trỏ tới trang "launch" tự submit form.
  const url = `${origin}/api/desktop/auth-bridge/launch?code=${id}&provider=${provider}`;

  return Response.json({ code: id, url, callback, provider, expiresInMs: TTL_MS });
}

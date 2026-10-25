// Trang khởi chạy đăng nhập Google cho bản desktop (mở ở trình duyệt hệ thống).
//
// NextAuth v5 không nhận GET /api/auth/signin/<provider> — phải POST kèm csrfToken.
// Trang này tự lấy csrfToken rồi submit form, đúng như trang đăng nhập mặc định.
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { handlers } from "@/lib/auth";
import { authBaseUrl } from "@/lib/self-hosted-config";

import { isLoopbackRequest, loopbackForbidden } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(req: Request) {
  if (!isLoopbackRequest(req)) return loopbackForbidden();
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const providerParam = url.searchParams.get("provider");
  const provider = providerParam === "openai" ? "openai" : "google";
  const providerLabel = provider === "openai" ? "ChatGPT" : "Google";
  // Luồng đăng nhập phải dùng origin của NextAuth (localhost) để cookie
  // PKCE/CSRF khớp origin (xem authBaseUrl()).
  const origin = authBaseUrl();

  const rows = await db
    .select({ id: schema.desktopAuthBridges.id })
    .from(schema.desktopAuthBridges)
    .where(eq(schema.desktopAuthBridges.id, code))
    .limit(1);
  if (!rows[0]) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:40px">
       <h2>Phiên đăng nhập không hợp lệ hoặc đã hết hạn.</h2>
       <p>Hãy bấm "Đăng nhập với ${providerLabel}" lại trong app AdsSync.</p></body>`,
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const callback = `${origin}/api/auth/bridge?code=${encodeURIComponent(code)}`;
  // NextAuth forward query string của request signin sang URL xác thực Google,
  // nên login_hint giúp bỏ màn chọn tài khoản khi máy đang đăng nhập nhiều tài khoản.
  // ChatGPT không dùng login_hint nên bỏ trống.
  const email = provider === "google" ? url.searchParams.get("email")?.trim() : null;
  const action = email
    ? `${origin}/api/auth/signin/google?login_hint=${encodeURIComponent(email)}&prompt=consent`
    : `${origin}/api/auth/signin/${provider}`;

  // Lấy CSRF token NGAY TRÊN SERVER rồi nhúng vào form (và forward cookie cho
  // trình duyệt). Trước đây trang tự fetch('/api/auth/csrf') bằng JS: người dùng
  // bấm nút trước khi fetch xong là form gửi thiếu token, Auth.js trả MissingCSRF
  // và hiện "Server error — There is a problem with the server configuration".
  const csrfReqHeaders = new Headers();
  const incomingCookie = req.headers.get("cookie");
  if (incomingCookie) csrfReqHeaders.set("cookie", incomingCookie);
  const csrfRes = await handlers.GET(
    new NextRequest(`${origin}/api/auth/csrf`, { headers: csrfReqHeaders }),
  );
  const csrfJson = (await csrfRes.json().catch(() => ({}))) as { csrfToken?: string };
  const csrfToken = csrfJson.csrfToken ?? "";
  const csrfCookies =
    typeof (csrfRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (csrfRes.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [];

  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  for (const cookie of csrfCookies) headers.append("set-cookie", cookie);

  return new Response(
    `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Đăng nhập AdsSync</title>
<style>body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f6fa;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:460px;padding:32px;border-radius:14px;background:#fff;border:1px solid #e6eaf0;box-shadow:0 8px 24px -14px rgba(15,23,42,.2);text-align:center}
h1{font-size:18px;margin:0 0 8px;font-weight:700;letter-spacing:-.01em}p{color:#64748b;font-size:13.5px;margin:0}
button{margin-top:20px;background:#2563eb;color:#fff;border:0;padding:10px 20px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}</style>
</head><body><div class="card">
<h1>Đang chuyển tới ${providerLabel}…</h1>
<p>Nếu không tự chuyển, bấm nút bên dưới.</p>
<form id="f" method="POST" action="${esc(action)}">
  <input type="hidden" name="csrfToken" id="csrf" value="${esc(csrfToken)}" />
  <input type="hidden" name="callbackUrl" value="${esc(callback)}" />
  <button type="submit" id="btn">Tiếp tục đăng nhập ${providerLabel}</button>
</form>
<p id="note" style="margin-top:12px;color:#b45309"></p>
</div>
<script>
(function () {
  var tokenEl = document.getElementById('csrf');
  var note = document.getElementById('note');
  if (tokenEl && tokenEl.value) {
    document.getElementById('f').submit();
    return;
  }
  var btn = document.getElementById('btn');
  btn.disabled = true;
  btn.style.opacity = '.5';
  note.textContent = 'Chưa chuẩn bị được phiên đăng nhập. Hãy tải lại trang này (Ctrl+R).';
})();
</script></body></html>`,
    { headers },
  );
}

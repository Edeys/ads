// Đích đến sau khi đăng nhập Google trong trình duyệt hệ thống (bản desktop).
//
// Google chặn OAuth trong webview, nên app mở trình duyệt hệ thống. Sau khi đăng
// nhập thành công, route này lưu cookie phiên vào bảng desktop_auth_bridges để
// webview lấy lại (xem /api/desktop/auth-bridge/status).
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

import { isLoopbackRequest, loopbackForbidden } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trang trạng thái độc lập (mở ngoài app). Dùng cùng bảng màu với app:
// nền sáng, card trắng, bo góc 14px.
const PAGE = (title: string, body: string, ok: boolean) => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f6fa;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:520px;padding:32px;border-radius:14px;background:#fff;border:1px solid #e6eaf0;box-shadow:0 8px 24px -14px rgba(15,23,42,.2);text-align:center}
h1{font-size:19px;margin:14px 0 8px;font-weight:700;letter-spacing:-.01em}p{color:#64748b;margin:0;font-size:14px}
.badge{display:inline-block;padding:5px 12px;border-radius:8px;font-size:12.5px;font-weight:600;background:${ok ? "#ecfdf5" : "#fef2f2"};color:${ok ? "#047857" : "#b91c1c"}}</style></head>
<body><div class="card"><span class="badge">${ok ? "Thành công" : "Lỗi"}</span><h1>${title}</h1><p>${body}</p></div></body></html>`;

export async function GET(req: Request) {
  if (!isLoopbackRequest(req)) return loopbackForbidden();
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";

  if (!code) {
    return new Response(PAGE("Thiếu mã bridge", "Hãy đăng nhập lại từ app AdsSync.", false), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    return new Response(
      PAGE("Chưa đăng nhập", "Hãy đăng nhập Google trước khi quay lại AdsSync.", false),
      { status: 401, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  // Cookie phiên do NextAuth vừa đặt trong trình duyệt hệ thống.
  const jar = await cookies();
  let cookieName: string | null = null;
  let cookieValue: string | null = null;
  for (const c of jar.getAll()) {
    if (/session-token$/.test(c.name) && c.value) {
      cookieName = c.name;
      cookieValue = c.value;
      break;
    }
  }

  if (!cookieName || !cookieValue) {
    return new Response(
      PAGE("Không đọc được phiên", "Hãy thử đăng nhập lại.", false),
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  await db
    .update(schema.desktopAuthBridges)
    .set({
      userId,
      email: (session?.user as any)?.email ?? null,
      name: (session?.user as any)?.name ?? null,
      sessionCookieName: cookieName,
      sessionCookieEnc: encryptSecret({ v: cookieValue }),
      usedAt: new Date(),
    })
    .where(eq(schema.desktopAuthBridges.id, code));

  return new Response(
    PAGE(
      "Đã đăng nhập thành công",
      "Quay lại cửa sổ AdsSync — phiên sẽ tự động nạp trong vài giây.",
      true,
    ),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

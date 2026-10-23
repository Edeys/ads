// Webview poll trạng thái bridge. Khi người dùng đã đăng nhập Google ở trình duyệt
// hệ thống, route này trả lại cookie phiên (Set-Cookie) cho webview — cùng origin nên
// trình duyệt tự lưu cookie vào webview.
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptSecret } from "@/lib/crypto";

import { isLoopbackRequest, loopbackForbidden } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AGE = 30 * 24 * 60 * 60; // 30 ngày (khớp mặc định của NextAuth)

export async function GET(req: Request) {
  if (!isLoopbackRequest(req)) return loopbackForbidden();
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!code) return Response.json({ ok: false, reason: "missing_code" });

  const rows = await db
    .select()
    .from(schema.desktopAuthBridges)
    .where(eq(schema.desktopAuthBridges.id, code))
    .limit(1);
  const row = rows[0];

  if (!row) return Response.json({ ok: false, reason: "not_found" });
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return Response.json({ ok: false, reason: "expired" });
  }
  if (!row.usedAt || !row.sessionCookieEnc || !row.sessionCookieName) {
    return Response.json({ ok: false, reason: "pending" });
  }

  // Dùng 1 lần rồi xoá.
  await db.delete(schema.desktopAuthBridges).where(eq(schema.desktopAuthBridges.id, code));

  let value = "";
  try {
    value = decryptSecret(row.sessionCookieEnc).v ?? "";
  } catch {
    value = "";
  }
  if (!value) return Response.json({ ok: false, reason: "bad_secret" });

  const res = Response.json({
    ok: true,
    user: { email: row.email, name: row.name },
  });
  res.headers.append(
    "set-cookie",
    `${row.sessionCookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}`,
  );
  return res;
}

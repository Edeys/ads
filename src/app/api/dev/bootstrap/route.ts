// Seed dữ liệu lõi cho bản desktop: user dev + biz + quyền owner + gói trial + 3 mẫu.
// Desktop shell gọi route này ngay sau khi /api/health trả 200 (idempotent, gọi nhiều lần vô hại).
//
// Chỉ bật khi ADSYNC_ALLOW_BOOTSTRAP=1 — server local bind 127.0.0.1 nên không lộ ra ngoài.
import { db } from "@/db";
import { seedCore } from "@/db/seed-core";
import { isLoopbackRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

function isLoopback(req: Request): boolean {
  return isLoopbackRequest(req);
}

export async function POST(req: Request) {
  if (!isLoopback(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  if (process.env.ADSYNC_ALLOW_BOOTSTRAP !== "1") {
    return Response.json({ error: "bootstrap không được bật" }, { status: 403 });
  }

  const res = await seedCore(db, console.log);
  return Response.json({ ok: true, slug: res.slug, created: res.created });
}

export async function GET(req: Request) {
  if (!isLoopback(req)) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({
    ok: true,
    enabled: process.env.ADSYNC_ALLOW_BOOTSTRAP === "1",
    hint: "POST để tạo user dev + biz mẫu (idempotent)",
  });
}

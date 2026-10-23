// GET /api/biz/:slug/backup — tải bản sao lưu PGlite (.tar.gz) cho owner.
//
// PGlite cung cấp dumpDataDir() để đóng gói PGDATA an toàn trong lúc DB đang mở.
// Bản sao lưu chứa cả secret đã mã hoá bằng NEXTAUTH_SECRET, nên chỉ khôi phục
// được trên cùng máy hoặc cùng file %APPDATA%\AdsSync\secret.txt.
import { db } from "@/db";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  if (m.member.role !== "owner") {
    return Response.json({ error: "Chỉ chủ Biz được tải bản sao lưu." }, { status: 403 });
  }
  if (process.env.DATABASE_URL) {
    return Response.json(
      { error: "Bản sao lưu tự động chỉ hỗ trợ PGlite. Với Postgres, dùng pg_dump." },
      { status: 400 },
    );
  }

  const client = (db as any).$client as { dumpDataDir?: (compression?: "none" | "gzip" | "auto") => Promise<Blob> };
  if (typeof client?.dumpDataDir !== "function") {
    return Response.json({ error: "Không tìm thấy PGlite client để sao lưu." }, { status: 500 });
  }

  try {
    const file = await client.dumpDataDir("gzip");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return new Response(file, {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="adsync-backup-${stamp}.tar.gz"`,
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Không tạo được bản sao lưu." }, { status: 500 });
  }
}

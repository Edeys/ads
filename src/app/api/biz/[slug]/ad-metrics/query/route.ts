// POST /api/biz/:slug/ad-metrics/query — lấy số liệu theo hợp đồng API gốc.
import { getMembership } from "@/lib/guard";
import { parseQueryBody, runQuery } from "@/lib/ad-query";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const perms = m.member.permissions as string[];
  if (m.member.role !== "owner" && !perms.includes("ad_metrics.access")) {
    return Response.json({ detail: "Bạn không có quyền xem Chỉ số quảng cáo trong Biz này." }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  if (!raw) return Response.json({ detail: [{ msg: "Value error, Body JSON không hợp lệ." }] }, { status: 422 });

  const parsed = parseQueryBody(raw);
  if (!parsed.ok) {
    return Response.json({ detail: parsed.errors.map((msg) => ({ msg })) }, { status: 422 });
  }

  try {
    return Response.json(await runQuery(m.biz.id, parsed.body));
  } catch (e: any) {
    return Response.json({ detail: e?.message ?? "Không tải được số liệu quảng cáo." }, { status: 500 });
  }
}

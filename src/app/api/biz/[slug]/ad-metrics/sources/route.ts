// GET /api/biz/:slug/ad-metrics/sources — tài khoản quảng cáo khả dụng theo nền tảng.
import { getMembership } from "@/lib/guard";
import { loadSources } from "@/lib/ad-query";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const perms = m.member.permissions as string[];
  if (m.member.role !== "owner" && !perms.includes("ad_metrics.access")) {
    return Response.json({ detail: "Bạn không có quyền xem Chỉ số quảng cáo trong Biz này." }, { status: 403 });
  }

  return Response.json(await loadSources(m.biz.id));
}

// GET /api/biz/:slug/ad-metrics/catalog — danh mục chỉ số theo nền tảng.
import { getMembership } from "@/lib/guard";
import { AD_CATALOG, DATE_PRESETS } from "@/lib/ad-catalog";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const perms = m.member.permissions as string[];
  if (m.member.role !== "owner" && !perms.includes("ad_metrics.access")) {
    return Response.json({ detail: "Bạn không có quyền xem Chỉ số quảng cáo trong Biz này." }, { status: 403 });
  }

  const platforms = Object.fromEntries(
    Object.entries(AD_CATALOG).map(([key, c]) => [
      key,
      {
        levels: c.levels,
        has_parent_ids: c.has_parent_ids,
        default_columns: c.default_columns,
        metrics: c.metrics,
      },
    ]),
  );

  return Response.json({ platforms, date_presets: DATE_PRESETS });
}

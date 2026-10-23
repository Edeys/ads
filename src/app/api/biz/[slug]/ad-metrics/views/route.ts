// GET /api/biz/:slug/ad-metrics/views — view đã lưu của từng nền tảng.
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { AD_PLATFORMS } from "@/lib/ad-catalog";
import { normalizeView } from "@/lib/ad-views";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const perms = m.member.permissions as string[];
  if (m.member.role !== "owner" && !perms.includes("ad_metrics.access")) {
    return Response.json({ detail: "Bạn không có quyền xem Chỉ số quảng cáo trong Biz này." }, { status: 403 });
  }

  const rows = await db
    .select()
    .from(schema.adMetricViews)
    .where(and(eq(schema.adMetricViews.bizId, m.biz.id), eq(schema.adMetricViews.userId, m.member.userId)));

  const views: Record<string, unknown> = {};
  for (const platform of AD_PLATFORMS) {
    const row = rows.find((r) => r.platform === platform);
    views[platform] = row
      ? normalizeView(platform, {
          columns: row.columns,
          highlights: row.highlights,
          merge_accounts: row.mergeAccounts,
          default_level: row.defaultLevel,
          custom_fields: row.customFields,
        })
      : null;
  }

  return Response.json({ views });
}

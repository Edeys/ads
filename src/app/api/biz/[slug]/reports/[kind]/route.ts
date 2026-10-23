// API Báo cáo — shape khớp Done.vn: /reports/overview | /reports/biz | /reports/llm-usage
import { getMembership } from "@/lib/guard";
import { resolveRange } from "@/lib/reports";
import { getBizGroups, getLlmUsageV2, getOverviewV2 } from "@/lib/report-groups";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; kind: string }> }) {
  const { slug, kind } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const preset = url.searchParams.get("preset") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  // /reports/overview còn nhận ?days=N
  const days = url.searchParams.get("days");
  const range = days ? rangeFromDays(Number(days)) : resolveRange(preset, from, to);

  switch (kind) {
    case "overview":
      return Response.json(await getOverviewV2(m.biz.id, range));
    case "biz":
      return Response.json(await getBizGroups(m.biz.id, range));
    case "llm-usage":
      return Response.json(
        await getLlmUsageV2(m.biz.id, range, {
          provider: url.searchParams.get("provider"),
          model: url.searchParams.get("model"),
        }),
      );
    default:
      return Response.json({ error: "unknown report" }, { status: 404 });
  }
}

function rangeFromDays(days: number) {
  const safe = Number.isFinite(days) && days > 0 ? Math.min(366, Math.round(days)) : 7;
  const to = new Date();
  const from = new Date(to.getTime() - safe * 86_400_000);
  const span = to.getTime() - from.getTime();
  return {
    preset: (`last${safe}` as const) as unknown as import("@/lib/reports").ReportPreset,
    label: `${safe} ngày qua`,
    from,
    to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: new Date(from.getTime() - 1),
  };
}

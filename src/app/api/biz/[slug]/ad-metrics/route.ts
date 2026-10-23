import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { metaToken, metaSetStatus, metaStatusMap } from "@/lib/meta-ads";
import { tiktokToken, tiktokSetStatus } from "@/lib/tiktok-ads";
import { googleAdsToken, googleAdsSetStatus } from "@/lib/google-ads";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

// GET /api/biz/:slug/ad-metrics?conn=<connId>&platform=meta|tiktok|google&acc=<adAccountId>&level=campaign|adset|ad&datePreset=today|last_7d
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const q = new URL(req.url).searchParams;
  const connId = q.get("conn") ?? "";
  const platform = q.get("platform") ?? "meta";
  const acc = q.get("acc") ?? "";
  const level = (q.get("level") ?? "campaign") as "campaign" | "adset" | "ad";
  const datePreset = q.get("datePreset") ?? "last_7d";

  const [conn] = await db
    .select()
    .from(schema.connections)
    .where(eq(schema.connections.id, connId))
    .limit(1);

  if (!conn || conn.bizId !== m.biz.id) {
    return Response.json({ error: "connection_not_found" }, { status: 404 });
  }

  try {
    if (platform === "meta" || conn.provider === "meta_ads") {
      const token = await metaToken(connId);
      const fields = `${level}_id,${level}_name,objective,spend,impressions,clicks,cpc,cpm,ctr,actions`;
      const statusById = await metaStatusMap(token, acc, level);
      const url = `https://graph.facebook.com/v21.0/${acc}/insights?level=${level}&date_preset=${datePreset}&fields=${fields}&limit=200&access_token=${token}`;
      const res = await fetch(url);
      const j = await res.json();
      if (j.error) return Response.json({ error: j.error.message }, { status: 400 });

      const rows = (j.data ?? []).map((r: any) => {
        const id = r[`${level}_id`];
        const name = r[`${level}_name`] ?? id;
        const status = statusById.get(String(id)) ?? "UNKNOWN";
        const spend = Number(r.spend || 0);
        const impressions = Number(r.impressions || 0);
        const clicks = Number(r.clicks || 0);
        const ctr = Number(r.ctr || 0);
        const cpc = Number(r.cpc || 0);
        const cpm = Number(r.cpm || 0);

        // Đếm conversions từ actions
        const acts: any[] = r.actions ?? [];
        const conv = acts
          .filter((a) => a.action_type.includes("purchase") || a.action_type.includes("lead") || a.action_type.includes("conversion"))
          .reduce((sum, a) => sum + Number(a.value || 0), 0);

        return {
          id,
          name,
          level,
          status,
          spend,
          impressions,
          clicks,
          ctr,
          cpc,
          cpm,
          conversions: conv,
          cpa: conv > 0 ? Math.round(spend / conv) : 0,
        };
      });

      return Response.json({ rows });
    }

    return Response.json({ rows: [] });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/biz/:slug/ad-metrics/toggle — bật/tắt trực tiếp thực thể trên nền tảng
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  if (!isOwner && !perms.includes("ad_metrics.access") && !perms.includes("jobs.access")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { connId, platform, targetId, status } = body;
  if (!connId || !targetId || !status) {
    return Response.json({ error: "missing_parameters" }, { status: 400 });
  }

  try {
    if (platform === "meta" || platform === "meta_ads") {
      const token = await metaToken(connId);
      await metaSetStatus(token, targetId, status === "ACTIVE" ? "ACTIVE" : "PAUSED");
    }

    await logActivity({
      bizId: m.biz.id,
      actorId: m.member.userId,
      action: status === "ACTIVE" ? "ad.enable" : "ad.pause",
      objectType: "ad_entity",
      objectId: targetId,
      detail: { platform, status },
    });

    return Response.json({ ok: true, status });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

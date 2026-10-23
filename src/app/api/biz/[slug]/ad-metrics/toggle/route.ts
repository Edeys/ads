// POST /api/biz/:slug/ad-metrics/toggle — bật/tắt thực thể trên nền tảng.
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { isLevel, isPlatform } from "@/lib/ad-catalog";
import { toggleEntity } from "@/lib/ad-query";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const perms = m.member.permissions as string[];
  if (m.member.role !== "owner" && !perms.includes("ad_metrics.access") && !perms.includes("jobs.access")) {
    return Response.json({ detail: "Bạn không có quyền thao tác quảng cáo." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { platform, credential_id, account_id, level, entity_id, adset_id, status } = body ?? {};
  if (!isPlatform(platform) || !isLevel(level) || !credential_id || !account_id || !entity_id) {
    return Response.json({ detail: "Thiếu tham số." }, { status: 400 });
  }
  if (status !== "ACTIVE" && status !== "PAUSED") {
    return Response.json({ detail: "Trạng thái không hợp lệ." }, { status: 400 });
  }

  try {
    const result = await toggleEntity({
      bizId: m.biz.id,
      platform,
      credential_id: String(credential_id),
      account_id: String(account_id),
      level,
      entity_id: String(entity_id),
      adset_id: adset_id ? String(adset_id) : undefined,
      status,
    });

    await logActivity({
      bizId: m.biz.id,
      actorId: m.member.userId,
      action: status === "ACTIVE" ? "ad.enable" : "ad.pause",
      objectType: "ad_entity",
      objectId: String(entity_id),
      detail: { platform, level, ok: result.ok },
    });

    return Response.json(result);
  } catch (e: any) {
    return Response.json({ ok: false, entity_id, status: null, error: e?.message ?? "Không thực hiện được." }, { status: 400 });
  }
}

import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { metaToken } from "@/lib/meta-ads";
import { createCampaignFromPost } from "@/lib/meta-campaign";

export const runtime = "nodejs";

// GET /api/biz/:slug/quick-ads — trạng thái chế độ chạy (mock hay thật)
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  return Response.json({
    realWrites: process.env.ADSYNC_REAL_WRITES === "1",
    approvalRequired: true,
  });
}

// POST /api/biz/:slug/quick-ads — tạo campaign PAUSED từ bài viết
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  const allowed = m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("quick_ads.access"));
  if (!allowed) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { credentialId, adAccountId, pageId, postId, templateId, saveAs } = body;
  if (!credentialId || !adAccountId || !pageId || !postId || !templateId) {
    return Response.json({ error: "Thiếu tham số" }, { status: 400 });
  }

  const [tpl] = await db.select().from(schema.adTemplates)
    .where(and(eq(schema.adTemplates.id, templateId), eq(schema.adTemplates.bizId, m!.biz.id))).limit(1);
  if (!tpl) return Response.json({ error: "template_not_found" }, { status: 404 });

  // Mặc định KHÔNG ghi lên tài khoản thật. Chỉ khi chủ máy bật rõ ràng
  // ADSYNC_REAL_WRITES=1 thì mới gọi Marketing API (và vẫn phải qua Approval Gate ở lớp UI).
  const realWrites = process.env.ADSYNC_REAL_WRITES === "1";

  if (!realWrites) {
    const mocked = {
      campaignId: `mock_campaign_${crypto.randomUUID().slice(0, 8)}`,
      adSetId: `mock_adset_${crypto.randomUUID().slice(0, 8)}`,
      adId: `mock_ad_${crypto.randomUUID().slice(0, 8)}`,
      status: "PAUSED",
      mocked: true,
      note: "Chế độ mô phỏng: chưa gửi lệnh nào lên Meta. Bật ADSYNC_REAL_WRITES=1 để chạy thật.",
    };
    await logActivity({
      bizId: m!.biz.id,
      actorId: m!.member.userId,
      action: "quick_ads.create",
      objectType: "campaign",
      objectId: mocked.campaignId,
      detail: { postId, templateId, mocked: true, template: tpl.name },
    });
    if (saveAs) {
      await db.insert(schema.adTemplates).values({
        bizId: m!.biz.id,
        name: saveAs,
        objective: tpl.objective,
        destination: tpl.destination,
        dailyBudget: tpl.dailyBudget,
        spec: tpl.spec as Record<string, unknown>,
      });
    }
    return Response.json(mocked);
  }

  try {
    const token = await metaToken(credentialId);
    const r = await createCampaignFromPost({ token, adAccountId, postId, pageId, template: tpl });
    await logActivity({ bizId: m!.biz.id, actorId: m!.member.userId, action: "quick_ads.create", objectType: "campaign", objectId: r.campaignId, detail: { postId, templateId } });
    if (saveAs) {
      await db.insert(schema.adTemplates).values({ bizId: m!.biz.id, name: saveAs, objective: tpl.objective, destination: tpl.destination, dailyBudget: tpl.dailyBudget, spec: tpl.spec as Record<string, unknown> });
    }
    return Response.json(r);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

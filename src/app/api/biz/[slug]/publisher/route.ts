// Publisher — đăng bài tự động lên Fanpage (fork full-feature, done.vn không có).
// POST action:
//   - create        : tạo bài (now → publish ngay; schedule → lên lịch; draft)
//   - ai_write      : AI viết nội dung bài từ brief
//   - policy_check  : AI soát chính sách nội dung trước khi đăng
// PUT  action: publish_now | cancel | reschedule | delete
import { db, schema } from "@/db";
import { eq, desc, and } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { publishPagePost } from "@/lib/meta-page";
import { aiChat } from "@/lib/ai";
import { emitEvent } from "@/lib/events";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  return m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("publisher.access")) ? m : null;
}

const MIN_SCHEDULE_MS = 10 * 60 * 1000;   // Meta: tối thiểu 10 phút
const MAX_SCHEDULE_MS = 30 * 24 * 60 * 60 * 1000; // tối đa 30 ngày

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const posts = await db.select().from(schema.scheduledPosts)
    .where(eq(schema.scheduledPosts.bizId, m.biz.id)).orderBy(desc(schema.scheduledPosts.createdAt)).limit(200);

  const conns = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.bizId, m.biz.id), eq(schema.connections.provider, "meta_ads")));
  const aiConns = await db.select().from(schema.connections)
    .where(eq(schema.connections.bizId, m.biz.id));
  const availablePages: { connectionId: string; id: string; name: string }[] = [];
  for (const c of conns) {
    for (const p of ((c.meta as any)?.pages ?? []) as { id: string; name?: string }[]) {
      availablePages.push({ connectionId: c.id, id: p.id, name: p.name ?? p.id });
    }
  }
  const aiProviders = aiConns
    .filter((c) => ["gemini", "openai", "anthropic", "deepseek", "openai_compatible"].includes(c.provider))
    .map((c) => ({ id: c.id, name: c.name, provider: c.provider }));

  return Response.json({ posts, availablePages, aiProviders });
}

async function aiPolicyCheck(bizId: string, aiConnId: string, message: string) {
  const ai = await aiChat({
    connId: aiConnId, bizId, purpose: "policy_check",
    system: `Bạn là bộ lọc chính sách nội dung Facebook. Trả lời ĐÚNG JSON {"ok":true|false,"reason":"..."}. Chặn: vi phạm chính sách Meta (khoe thu nhập, before/after, claim y khoa, nhạy cảm, lừa đảo).`,
    user: `Nội dung bài chuẩn bị đăng fanpage:\n---\n${message}\n---`,
  });
  const m = ai.text.match(/\{[^}]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* fallthrough */ }
  }
  return { ok: true, reason: "AI parse lỗi — coi như đạt" };
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));

  try {
    if (b.action === "ai_write") {
      if (!b.aiConnId || !b.brief?.trim()) return Response.json({ error: "Thiếu aiConnId/brief" }, { status: 400 });
      const ai = await aiChat({
        connId: b.aiConnId, bizId: m.biz.id, purpose: "content_write",
        system: `Bạn là copywriter bán hàng giỏi nhất Việt Nam. Viết bài đăng fanpage từ brief. Cấu trúc: hook mạnh 1-2 dòng đầu → giá trị/lợi ích → bằng chứng/thông số thực → CTA rõ ràng + hashtag. Viết tiếng Việt tự nhiên, đúng chính sách Meta, không emoji spam. Trả về DUY NHẤT nội dung bài viết.`,
        user: `Brief: ${b.brief}\nNền tảng: Facebook fanpage${b.tone ? `\nGiọng điệu: ${b.tone}` : ""}`,
      });
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "publisher.ai_write", objectType: "ai_content" });
      return Response.json({ content: ai.text.trim() });
    }

    if (b.action === "policy_check") {
      if (!b.aiConnId || !b.message?.trim()) return Response.json({ error: "Thiếu aiConnId/message" }, { status: 400 });
      const r = await aiPolicyCheck(m.biz.id, b.aiConnId, b.message);
      return Response.json(r);
    }

    // ---- create ----
    if (!b.connectionId || !b.pageId || !b.message?.trim()) {
      return Response.json({ error: "Thiếu connectionId/pageId/message" }, { status: 400 });
    }
    const mode = ["now", "schedule", "draft"].includes(b.mode) ? b.mode : "schedule";
    const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;

    if (mode === "schedule") {
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return Response.json({ error: "Thiếu/g sai scheduledAt" }, { status: 400 });
      const delta = scheduledAt.getTime() - Date.now();
      if (delta < MIN_SCHEDULE_MS) return Response.json({ error: "Meta yêu cầu giờ đăng cách hiện tại tối thiểu 10 phút" }, { status: 400 });
      if (delta > MAX_SCHEDULE_MS) return Response.json({ error: "Meta chỉ cho lên lịch tối đa 30 ngày" }, { status: 400 });
    }

    // AI policy check trước khi đăng (tuỳ chọn)
    let policy: { ok: boolean; reason?: string; model?: string } | null = null;
    if (b.aiConnId && b.runPolicyCheck !== false) {
      const pol = await aiPolicyCheck(m.biz.id, b.aiConnId, b.message);
      policy = pol;
      if (!pol.ok && !b.force) {
        // AI chặn → lưu draft kèm lý do để user sửa, không đăng
        const [row] = await db.insert(schema.scheduledPosts).values({
          bizId: m.biz.id, connectionId: b.connectionId, pageId: String(b.pageId),
          message: String(b.message), linkUrl: b.linkUrl ?? null,
          photos: (b.photos ?? []).slice(0, 10), videoUrl: b.videoUrl ?? null,
          mode: "draft", status: "draft", aiPolicyCheck: pol,
        }).returning();
        await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "publisher.ai_blocked", objectType: "scheduled_post", objectId: row.id, detail: { reason: pol.reason } });
        return Response.json({ blocked: true, reason: pol.reason, id: row.id });
      }
    }

    if (mode === "now") {
      const r = await publishPagePost(b.connectionId, String(b.pageId), {
        message: String(b.message),
        linkUrl: b.linkUrl ?? undefined,
        photos: (b.photos ?? []).slice(0, 10),
        videoUrl: b.videoUrl ?? undefined,
      });
      const [row] = await db.insert(schema.scheduledPosts).values({
        bizId: m.biz.id, connectionId: b.connectionId, pageId: String(b.pageId),
        message: String(b.message), linkUrl: b.linkUrl ?? null,
        photos: (b.photos ?? []).slice(0, 10), videoUrl: b.videoUrl ?? null,
        mode: "now", status: "published", postId: r.postId, publishedAt: new Date(),
        aiPolicyCheck: policy ?? undefined,
      }).returning();
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "publisher.publish_now", objectType: "scheduled_post", objectId: row.id, detail: { postId: r.postId, pageId: b.pageId } });
      emitEvent(m.biz.id, "post.published", { source: "manual", scheduledPostId: row.id, pageId: b.pageId, postId: r.postId }).catch(() => {});
      return Response.json({ published: true, postId: r.postId, id: row.id });
    }

    const [row] = await db.insert(schema.scheduledPosts).values({
      bizId: m.biz.id, connectionId: b.connectionId, pageId: String(b.pageId),
      message: String(b.message), linkUrl: b.linkUrl ?? null,
      photos: (b.photos ?? []).slice(0, 10), videoUrl: b.videoUrl ?? null,
      mode, status: mode === "schedule" ? "scheduled" : "draft",
      scheduledAt: mode === "schedule" ? scheduledAt : null,
      aiPolicyCheck: policy ?? undefined,
    }).returning();
    await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: `publisher.${mode}`, objectType: "scheduled_post", objectId: row.id });
    return Response.json({ id: row.id, status: row.status });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return Response.json({ error: "Thiếu id" }, { status: 400 });
  const [post] = await db.select().from(schema.scheduledPosts)
    .where(and(eq(schema.scheduledPosts.id, b.id), eq(schema.scheduledPosts.bizId, m.biz.id))).limit(1);
  if (!post) return Response.json({ error: "not_found" }, { status: 404 });

  try {
    if (b.action === "publish_now") {
      const r = await publishPagePost(post.connectionId, post.pageId, {
        message: post.message, linkUrl: post.linkUrl ?? undefined,
        photos: (post.photos as string[]) ?? [], videoUrl: post.videoUrl ?? undefined,
      });
      await db.update(schema.scheduledPosts).set({ status: "published", postId: r.postId, publishedAt: new Date(), publishError: null }).where(eq(schema.scheduledPosts.id, post.id));
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "publisher.publish_now", objectType: "scheduled_post", objectId: post.id });
      emitEvent(m.biz.id, "post.published", { source: "manual", scheduledPostId: post.id, pageId: post.pageId, postId: r.postId }).catch(() => {});
      return Response.json({ published: true, postId: r.postId });
    }
    if (b.action === "cancel") {
      await db.update(schema.scheduledPosts).set({ status: "cancelled" }).where(eq(schema.scheduledPosts.id, post.id));
      return Response.json({ ok: true });
    }
    if (b.action === "reschedule") {
      const at = new Date(b.scheduledAt);
      if (Number.isNaN(at.getTime())) return Response.json({ error: "scheduledAt sai" }, { status: 400 });
      if (at.getTime() - Date.now() < MIN_SCHEDULE_MS) return Response.json({ error: "Cách hiện tại tối thiểu 10 phút" }, { status: 400 });
      await db.update(schema.scheduledPosts).set({ status: "scheduled", scheduledAt: at }).where(eq(schema.scheduledPosts.id, post.id));
      return Response.json({ ok: true });
    }
    return Response.json({ error: "action không hợp lệ" }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Thiếu id" }, { status: 400 });
  await db.delete(schema.scheduledPosts).where(and(eq(schema.scheduledPosts.id, id), eq(schema.scheduledPosts.bizId, m.biz.id)));
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "publisher.delete", objectType: "scheduled_post", objectId: id });
  return Response.json({ ok: true });
}

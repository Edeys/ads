// Publisher — đăng bài tự động đa đích (fork full-feature, done.vn không có).
// POST action:
//   - create        : tạo bài + N đích (now → publish tuần tự từng đích; schedule; draft)
//                     body.targets = [{pageId, connectionId?, label?}] hoặc legacy pageId+connectionId
//   - ai_write      : AI viết nội dung bài từ brief
//   - policy_check  : AI soát chính sách nội dung trước khi đăng
// PUT  action: publish_now (chạy nốt pending + retry đích lỗi) | cancel | reschedule | delete
import { db, schema } from "@/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { aiChat } from "@/lib/ai";
import { emitEvent } from "@/lib/events";
import { runAllPendingTargets } from "@/lib/post-targets";

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

  // Đích của từng bài — UI render chip trạng thái theo từng đích.
  const targets = posts.length
    ? await db.select().from(schema.scheduledPostTargets)
        .where(inArray(schema.scheduledPostTargets.scheduledPostId, posts.map((p) => p.id)))
    : [];
  const byPost = new Map<string, typeof targets>();
  for (const t of targets) {
    const list = byPost.get(t.scheduledPostId) ?? [];
    list.push(t);
    byPost.set(t.scheduledPostId, list);
  }

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

  return Response.json({
    posts: posts.map((p) => ({ ...p, targets: byPost.get(p.id) ?? [] })),
    availablePages,
    aiProviders,
  });
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

    // ---- create: một bài → nhiều đích (đa mạng, docs/ADAPTERS.md) ----
    if (!b.message?.trim()) return Response.json({ error: "Thiếu message" }, { status: 400 });

    // Chuẩn hoá đích: body.targets (đa đích, có type) hoặc legacy connectionId+pageId.
    const rawTargets: { pageId?: string; refId?: string; connectionId?: string; label?: string; type?: string }[] =
      Array.isArray(b.targets) && b.targets.length
        ? b.targets
        : b.pageId
          ? [{ pageId: String(b.pageId), connectionId: b.connectionId }]
          : [];
    if (!rawTargets.length) return Response.json({ error: "Thiếu targets/pageId" }, { status: 400 });
    const mode = ["now", "schedule", "draft"].includes(b.mode) ? b.mode : "schedule";
    const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;

    if (mode === "schedule") {
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return Response.json({ error: "Thiếu/g sai scheduledAt" }, { status: 400 });
      const delta = scheduledAt.getTime() - Date.now();
      if (delta < MIN_SCHEDULE_MS) return Response.json({ error: "Meta yêu cầu giờ đăng cách hiện tại tối thiểu 10 phút" }, { status: 400 });
      if (delta > MAX_SCHEDULE_MS) return Response.json({ error: "Meta chỉ cho lên lịch tối đa 30 ngày" }, { status: 400 });
    }

    const metaConns = await db.select().from(schema.connections)
      .where(and(eq(schema.connections.bizId, m.biz.id), eq(schema.connections.provider, "meta_ads")));
    const SOCIAL_TYPES = ["instagram", "x_twitter", "linkedin", "tiktok", "threads", "pinterest"];
    const resolved = rawTargets.slice(0, 10).map((t) => {
      const type = String(t.type ?? "meta_page");
      const refId = String(t.pageId ?? t.refId ?? "");
      if (type === "meta_page") {
        const connId = t.connectionId
          ? String(t.connectionId)
          : metaConns.find((c) => ((c.meta as any)?.pages ?? []).some((p: any) => String(p.id) === refId))?.id
            ?? (metaConns.length === 1 ? metaConns[0].id : null);
        return { type, refId, connId, label: t.label ?? null };
      }
      if (!SOCIAL_TYPES.includes(type)) return { type, refId, connId: null, label: t.label ?? null };
      // Đích social: connection bắt buộc; refId có thể rỗng (adapter tự dò user id).
      return { type, refId, connId: t.connectionId ? String(t.connectionId) : null, label: t.label ?? null };
    });
    // Instagram/Pinterest cần refId (IG user id / board id). X/LinkedIn/TikTok/Threads tự dò được.
    const missing = resolved.find((r) =>
      !r.connId || (r.type === "meta_page" && !r.refId) || ((r.type === "instagram" || r.type === "pinterest") && !r.refId));
    if (missing) {
      return Response.json({ error: `Đích ${missing.type} ${missing.refId || "?"} thiếu connection hoặc ID — kết nối lại ở trang Kết nối` }, { status: 400 });
    }

    // AI policy check trước khi đăng (tuỳ chọn)
    let policy: { ok: boolean; reason?: string; model?: string } | null = null;
    if (b.aiConnId && b.runPolicyCheck !== false) {
      const pol = await aiPolicyCheck(m.biz.id, b.aiConnId, b.message);
      policy = pol;
      if (!pol.ok && !b.force) {
        // AI chặn → lưu draft kèm lý do để user sửa, không đăng
        const [row] = await db.insert(schema.scheduledPosts).values({
          bizId: m.biz.id,
          message: String(b.message), linkUrl: b.linkUrl ?? null,
          photos: (b.photos ?? []).slice(0, 10), videoUrl: b.videoUrl ?? null,
          mode: "draft", status: "draft", aiPolicyCheck: pol,
        }).returning();
        await db.insert(schema.scheduledPostTargets).values(resolved.map((r) => ({
          scheduledPostId: row.id, type: r.type, connectionId: r.connId!, refId: r.refId, label: r.label,
        })));
        await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "publisher.ai_blocked", objectType: "scheduled_post", objectId: row.id, detail: { reason: pol.reason } });
        return Response.json({ blocked: true, reason: pol.reason, id: row.id });
      }
    }

    const [row] = await db.insert(schema.scheduledPosts).values({
      bizId: m.biz.id,
      message: String(b.message), linkUrl: b.linkUrl ?? null,
      photos: (b.photos ?? []).slice(0, 10), videoUrl: b.videoUrl ?? null,
      mode,
      status: mode === "now" ? "publishing" : mode === "schedule" ? "scheduled" : "draft",
      scheduledAt: mode === "schedule" ? scheduledAt : null,
      aiPolicyCheck: policy ?? undefined,
    }).returning();
    await db.insert(schema.scheduledPostTargets).values(resolved.map((r) => ({
      scheduledPostId: row.id, type: r.type, connectionId: r.connId!, refId: r.refId, label: r.label,
    })));

    if (mode === "now") {
      const { results, rollup } = await runAllPendingTargets(row);
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "publisher.publish_now", objectType: "scheduled_post", objectId: row.id, detail: { targets: results.length, ok: results.filter((x) => x.result.ok).length } });
      for (const x of results) {
        if (x.result.ok) emitEvent(m.biz.id, "post.published", { source: "manual", scheduledPostId: row.id, pageId: x.target.refId, postId: x.result.postId }).catch(() => {});
      }
      return Response.json({
        id: row.id,
        status: rollup?.status ?? "publishing",
        results: results.map((x) => ({ refId: x.target.refId, label: x.target.label, ok: x.result.ok, postId: "postId" in x.result ? x.result.postId : null, error: "error" in x.result ? x.result.error : null })),
      });
    }

    await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: `publisher.${mode}`, objectType: "scheduled_post", objectId: row.id, detail: { targets: resolved.length } });
    return Response.json({ id: row.id, status: row.status, targets: resolved.length });
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
      // Chạy nốt các đích pending và THỬ LẠI các đích lỗi — từng đích độc lập.
      await db.update(schema.scheduledPostTargets).set({ status: "pending", error: null })
        .where(and(eq(schema.scheduledPostTargets.scheduledPostId, post.id), eq(schema.scheduledPostTargets.status, "failed")));
      await db.update(schema.scheduledPosts).set({ status: "publishing" }).where(eq(schema.scheduledPosts.id, post.id));
      const { results, rollup } = await runAllPendingTargets(post);
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "publisher.publish_now", objectType: "scheduled_post", objectId: post.id, detail: { targets: results.length, ok: results.filter((x) => x.result.ok).length } });
      for (const x of results) {
        if (x.result.ok) emitEvent(m.biz.id, "post.published", { source: "manual", scheduledPostId: post.id, pageId: x.target.refId, postId: x.result.postId }).catch(() => {});
      }
      return Response.json({ status: rollup?.status ?? "publishing", results: results.map((x) => ({ refId: x.target.refId, ok: x.result.ok, error: "error" in x.result ? x.result.error : null })) });
    }
    if (b.action === "cancel") {
      await db.update(schema.scheduledPostTargets).set({ status: "cancelled" })
        .where(and(eq(schema.scheduledPostTargets.scheduledPostId, post.id), inArray(schema.scheduledPostTargets.status, ["pending", "publishing"])));
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

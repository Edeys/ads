// Comment Manager — fork full-feature (done.vn không có).
// GET : danh sách comment events (filter pageId/postId) + stats.
// POST: hành động thủ công — reply / hide / unhide / delete / private_reply /
//       refresh_post (đồng bộ comment mới nhất của 1 post từ Meta).
import { db, schema } from "@/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { replyToComment, setCommentHidden, deleteComment, privateReply, listPostComments } from "@/lib/meta-page";
import { findCredentialForPage } from "@/lib/comment-engine";
import { emitEvent } from "@/lib/events";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  return m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("comments.access")) ? m : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const u = new URL(req.url);
  const pageId = u.searchParams.get("pageId");
  const postId = u.searchParams.get("postId");
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 100), 300);

  const conds = [eq(schema.commentEvents.bizId, m.biz.id)];
  if (pageId) conds.push(eq(schema.commentEvents.pageId, pageId));
  if (postId) conds.push(eq(schema.commentEvents.postId, postId));

  const rows = await db.select().from(schema.commentEvents)
    .where(and(...conds))
    .orderBy(desc(schema.commentEvents.createdAt))
    .limit(limit);

  const stats = await db.select({
    total: sql<number>`count(*)::int`,
    hidden: sql<number>`count(*) filter (where hidden)::int`,
    replied: sql<number>`count(*) filter (where rule_action like '%replied%')::int`,
    unprocessed: sql<number>`count(*) filter (where processed_at is null)::int`,
  }).from(schema.commentEvents).where(and(...conds));

  return Response.json({ comments: rows, stats: stats[0] });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const credentialId = await findCredentialForPage(m.biz.id, String(body.pageId ?? ""));
  if (!credentialId) {
    return Response.json({ error: "Không tìm thấy kết nối Meta điều khiển page này — thêm kết nối Meta Ads (kèm page) ở trang Kết nối trước" }, { status: 400 });
  }

  try {
    if (action === "reply") {
      if (!body.commentId || !body.message?.trim()) return Response.json({ error: "Thiếu commentId/message" }, { status: 400 });
      const isReply = Boolean(body.parentCommentId); // có parent → reply vào comment, ngược lại comment lên post
      const r = await replyToComment(credentialId, body.commentId, body.message.trim(), isReply);
      await db.update(schema.commentEvents).set({
        ruleAction: "manual_replied", replyText: body.message.trim(), processedAt: new Date(),
      }).where(and(eq(schema.commentEvents.commentId, body.commentId), eq(schema.commentEvents.bizId, m.biz.id)));
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "comment.reply", objectType: "comment", objectId: body.commentId });
      emitEvent(m.biz.id, "comment.replied", { commentId: body.commentId, replyText: body.message, byRule: false }).catch(() => {});
      return Response.json({ ok: true, replyId: r.id });
    }

    if (action === "hide" || action === "unhide") {
      if (!body.commentId) return Response.json({ error: "Thiếu commentId" }, { status: 400 });
      await setCommentHidden(credentialId, body.commentId, action === "hide");
      await db.update(schema.commentEvents).set({ hidden: action === "hide" }).where(and(eq(schema.commentEvents.commentId, body.commentId), eq(schema.commentEvents.bizId, m.biz.id)));
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: `comment.${action}`, objectType: "comment", objectId: body.commentId });
      return Response.json({ ok: true });
    }

    if (action === "delete") {
      if (!body.commentId) return Response.json({ error: "Thiếu commentId" }, { status: 400 });
      await deleteComment(credentialId, body.commentId);
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "comment.delete", objectType: "comment", objectId: body.commentId });
      return Response.json({ ok: true });
    }

    if (action === "private_reply") {
      if (!body.commentId || !body.message?.trim()) return Response.json({ error: "Thiếu commentId/message" }, { status: 400 });
      const r = await privateReply(credentialId, body.commentId, body.message.trim());
      await db.update(schema.commentEvents).set({ privateReplySent: true, ruleAction: "manual_private_replied" }).where(and(eq(schema.commentEvents.commentId, body.commentId), eq(schema.commentEvents.bizId, m.biz.id)));
      await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "comment.private_reply", objectType: "comment", objectId: body.commentId });
      return Response.json({ ok: true, recipient: r.recipient_id ?? null });
    }

    if (action === "refresh_post") {
      if (!body.postId) return Response.json({ error: "Thiếu postId" }, { status: 400 });
      const { processIncomingComment } = await import("@/lib/comment-engine");
      const comments = await listPostComments(credentialId, body.postId, { limit: 50 });
      let imported = 0;
      for (const c of (comments.data ?? []) as any[]) {
        const r = await processIncomingComment({
          bizId: m.biz.id,
          pageId: String(body.pageId ?? ""),
          postId: body.postId,
          commentId: c.id,
          parentCommentId: c.parent?.id ?? null,
          authorId: c.from?.id ?? null,
          authorName: c.from?.name ?? null,
          message: c.message ?? "",
          verb: "add",
          source: "manual",
          fbCreatedAt: c.created_time ? new Date(c.created_time) : null,
        });
        if (!r.skipped) imported++;
      }
      return Response.json({ ok: true, imported, total: (comments.data ?? []).length });
    }

    return Response.json({ error: "action không hợp lệ" }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "failed" }, { status: 500 });
  }
}

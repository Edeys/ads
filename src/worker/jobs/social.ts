// Social jobs — fork full-feature:
// 1. commentWatchTick: poll comment page đang theo dõi (fallback khi chưa có webhook Meta)
// 2. postSchedulerTick: publish các bài lên lịch đến giờ (đăng bài tự động)
import { db } from "../../db";
import { pageSubscriptions, scheduledPosts, scheduledPostTargets } from "../../db/schema";
import { eq, and, lte } from "drizzle-orm";
import { listPagePosts, listPostComments } from "../../lib/meta-page";
import { processIncomingComment } from "../../lib/comment-engine";
import { runAllPendingTargets } from "../../lib/post-targets";
import { emitEvent } from "../../lib/events";
import { logActivity } from "../../lib/audit";

// Poll comments mọi page đang theo dõi. Webhook là nguồn realtime chính;
// poll chạy song song để không bỏ sót event khi webhook thiếu/lost.
export async function commentWatchTick() {
  const subs = await db.select().from(pageSubscriptions).where(eq(pageSubscriptions.status, "active"));
  let scannedComments = 0, newComments = 0;
  for (const sub of subs) {
    try {
      const posts = await listPagePosts(sub.connectionId, sub.pageId, { limit: 5 });
      for (const post of (posts.data ?? []) as { id: string }[]) {
        const comments = await listPostComments(sub.connectionId, post.id, { limit: 25 });
        for (const c of (comments.data ?? []) as any[]) {
          scannedComments++;
          const r = await processIncomingComment({
            bizId: sub.bizId,
            pageId: sub.pageId,
            postId: post.id,
            commentId: c.id,
            parentCommentId: c.parent?.id ?? null,
            authorId: c.from?.id ?? null,
            authorName: c.from?.name ?? null,
            message: c.message ?? "",
            verb: "add",
            source: "poll",
            fbCreatedAt: c.created_time ? new Date(c.created_time) : null,
          });
          if (!r.skipped) newComments++;
        }
      }
    } catch (e: any) {
      console.error(`[commentWatch] page ${sub.pageId} failed:`, e?.message);
    }
  }
  return { pages: subs.length, scannedComments, newComments };
}

// Đăng bài tự động: bài status=scheduled đến giờ → publish TỪNG ĐÍCH.
// Mỗi đích tự chạy, tự mang trạng thái — đích lỗi không chặn đích khác.
export async function postSchedulerTick() {
  const now = new Date();
  const due = await db
    .select()
    .from(scheduledPosts)
    .where(and(eq(scheduledPosts.status, "scheduled"), lte(scheduledPosts.scheduledAt, now)))
    .limit(20);
  let published = 0, failed = 0;
  for (const post of due) {
    await db.update(scheduledPosts).set({ status: "publishing" }).where(eq(scheduledPosts.id, post.id));

    // Bài cũ thời đơn đích (chưa có target): sinh bù 1 target từ pageId legacy.
    const existing = await db.select().from(scheduledPostTargets)
      .where(eq(scheduledPostTargets.scheduledPostId, post.id));
    if (!existing.length && post.pageId) {
      await db.insert(scheduledPostTargets).values({
        scheduledPostId: post.id, type: "meta_page",
        connectionId: post.connectionId, refId: post.pageId,
      });
    }

    const { results, rollup } = await runAllPendingTargets(post);
    for (const x of results) {
      if (x.result.ok) {
        published++;
        emitEvent(post.bizId, "post.published", {
          source: "scheduler", scheduledPostId: post.id, pageId: x.target.refId, postId: x.result.postId,
        }).catch(() => {});
      } else {
        failed++;
        emitEvent(post.bizId, "post.publish_failed", {
          scheduledPostId: post.id, pageId: x.target.refId, error: x.result.error,
        }).catch(() => {});
      }
    }
    await logActivity({
      bizId: post.bizId, action: "publisher.auto_publish",
      objectType: "scheduled_post", objectId: post.id,
      detail: { status: rollup?.status ?? "publishing", published: results.filter((x) => x.result.ok).length, failed: results.filter((x) => !x.result.ok).length },
    });
  }
  return { due: due.length, published, failed };
}

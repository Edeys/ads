// Đăng một bài theo ĐÍCH (target) + rollup trạng thái bài cha.
//
// Dùng chung bởi: publisher API (đăng ngay / retry), worker postSchedulerTick
// (đến giờ), MCP approval. Một đích lỗi chỉ đánh lỗi đích đó — các đích khác
// trong cùng bài vẫn chạy.
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { publishPagePost } from "@/lib/meta-page";
import { publishByType } from "@/lib/social-adapters";

type TargetRow = typeof schema.scheduledPostTargets.$inferSelect;
type PostRow = typeof schema.scheduledPosts.$inferSelect;

export async function runTarget(post: PostRow, target: TargetRow) {
  await db.update(schema.scheduledPostTargets).set({ status: "publishing", error: null })
    .where(eq(schema.scheduledPostTargets.id, target.id));
  try {
    const connectionId = target.connectionId ?? post.connectionId;
    if (!connectionId) throw new Error("Target thiếu connection (đích cũ không còn token)");
    if (target.type === "meta_page") {
      const r = await publishPagePost(connectionId, target.refId, {
        message: post.message,
        linkUrl: post.linkUrl ?? undefined,
        photos: (post.photos as string[]) ?? [],
        videoUrl: post.videoUrl ?? undefined,
      });
      await db.update(schema.scheduledPostTargets).set({
        status: "published", postId: r.postId, publishedAt: new Date(), error: null,
      }).where(eq(schema.scheduledPostTargets.id, target.id));
      return { ok: true as const, postId: r.postId };
    }
    // Mạng social khác — adapter registry theo type.
    const r = await publishByType(target.type, { connectionId, refId: target.refId, label: target.label }, {
      message: post.message,
      linkUrl: post.linkUrl ?? undefined,
      photos: (post.photos as string[]) ?? [],
      videoUrl: post.videoUrl ?? undefined,
    });
    await db.update(schema.scheduledPostTargets).set({
      status: "published", postId: r.postId, publishedAt: new Date(), error: null,
    }).where(eq(schema.scheduledPostTargets.id, target.id));
    return { ok: true as const, postId: r.postId };
  } catch (e: any) {
    await db.update(schema.scheduledPostTargets).set({
      status: "failed", error: String(e?.message ?? e).slice(0, 400),
    }).where(eq(schema.scheduledPostTargets.id, target.id));
    return { ok: false as const, error: String(e?.message ?? e).slice(0, 400) };
  }
}

// Sau khi chạy (một số) target: tính lại trạng thái bài cha từ trạng thái các đích.
// pending còn → giữ scheduled/publishing; hết pending → published / partial / failed.
export async function rollupParent(postId: string) {
  const targets = await db.select().from(schema.scheduledPostTargets)
    .where(eq(schema.scheduledPostTargets.scheduledPostId, postId));
  const open = targets.filter((t) => t.status === "pending" || t.status === "publishing").length;
  const published = targets.filter((t) => t.status === "published");
  const failed = targets.filter((t) => t.status === "failed");
  const cancelled = targets.filter((t) => t.status === "cancelled");

  if (open > 0) return; // còn đích chưa chạy — trạng thái cha do caller giữ

  let status: string;
  if (published.length === targets.length) status = "published";
  else if (published.length > 0) status = "partial";
  else if (failed.length > 0 && cancelled.length === 0) status = "failed";
  else if (cancelled.length === targets.length) status = "cancelled";
  else status = "failed";

  const first = published[0];
  await db.update(schema.scheduledPosts).set({
    status,
    postId: first?.postId ?? null,
    publishedAt: first?.publishedAt ?? null,
    publishError: status === "published" ? null : (failed[0]?.error ?? null),
  }).where(eq(schema.scheduledPosts.id, postId));
  return { status, published: published.length, failed: failed.length, total: targets.length };
}

// Chạy toàn bộ target còn pending của một bài (đăng ngay hoặc đến giờ).
export async function runAllPendingTargets(post: PostRow) {
  const targets = await db.select().from(schema.scheduledPostTargets)
    .where(and(
      eq(schema.scheduledPostTargets.scheduledPostId, post.id),
      eq(schema.scheduledPostTargets.status, "pending"),
    ));
  const results = [];
  for (const t of targets) results.push({ target: t, result: await runTarget(post, t) });
  const rollup = await rollupParent(post.id);
  return { results, rollup };
}

// Meta Page Webhook receiver — fork full-feature.
// GET  : handshake verify (hub.challenge) với verifyToken của pageSubscription.
// POST : nhận sự kiện field "feed" — comment mới → comment-engine (rule auto-reply),
//        post mới → chạy trực tiếp post_trigger configs (không cần chờ poll).
// Facebook đòi phản hồi nhanh → trả 200 ngay, xử lý nặng chạy nền.
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { pageSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { processIncomingComment } from "@/lib/comment-engine";
import { emitEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode");
  const token = u.searchParams.get("hub.verify_token");
  const challenge = u.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && challenge) {
    const subs = await db.select().from(pageSubscriptions).where(eq(pageSubscriptions.verifyToken, token));
    if (subs.length > 0) return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

type FeedChange = {
  field: string;
  value: {
    item?: string;
    verb?: string;
    comment_id?: string;
    post_id?: string;
    parent_id?: string;
    from?: { id?: string; name?: string };
    message?: string;
    created_time?: number;
    post?: { message?: string };
    sender_id?: string;
    recipient_id?: string;
  };
};

export async function POST(req: Request) {
  const appSecret = process.env.META_APP_SECRET;
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!appSecret) {
    // Không cấu hình app secret thì không thể xác thực — từ chối thay vì tin payload.
    return Response.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }
  // Đọc body có TRẦN (1MB): payload Meta thật chỉ vài KB — đọc không giới hạn
  // trước khi xác thực là chỗ chết bộ nhớ cho request ẩn danh.
  const MAX_WEBHOOK_BYTES = 1_000_000;
  const reader = req.body?.getReader();
  if (!reader) return Response.json({ ok: false, error: "empty_body" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_WEBHOOK_BYTES) {
      try { await reader.cancel(); } catch { /* đã hủy được gì thì hủy */ }
      return Response.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks);
  const expected = `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 403 });
  }

  let body: any;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return Response.json({ ok: true }); // payload lạ vẫn phải 200 để Meta không retry
  }
  if (body?.object !== "page") return Response.json({ ok: true });

  const entries: { id: string; changes?: FeedChange[] }[] = body.entry ?? [];

  // Xử lý nền, trả 200 ngay
  (async () => {
    for (const entry of entries) {
      const pageId = entry.id;
      const [sub] = await db.select().from(pageSubscriptions).where(eq(pageSubscriptions.pageId, pageId)).limit(1);
      if (!sub) continue; // page chưa đăng ký theo dõi — bỏ qua
      const bizId = sub.bizId;
      await db.update(pageSubscriptions).set({ lastEventAt: new Date() }).where(eq(pageSubscriptions.id, sub.id));

      for (const change of entry.changes ?? []) {
        if (change.field !== "feed") continue;
        const v = change.value;
        try {
          if (v.item === "comment") {
            await processIncomingComment({
              bizId,
              pageId,
              postId: v.post_id ?? "",
              commentId: v.comment_id ?? `${v.post_id}_unknown`,
              parentCommentId: v.parent_id ?? null,
              authorId: v.from?.id ?? null,
              authorName: v.from?.name ?? null,
              message: v.message ?? "",
              verb: v.verb === "edited" ? "edited" : v.verb === "remove" ? "remove" : "add",
              source: "webhook",
              fbCreatedAt: v.created_time ? new Date(v.created_time * 1000) : null,
            });
          } else if (v.item === "post" && v.verb === "add") {
            // Bài mới trên page → bắn event n8n + chạy post_trigger configs ngay
            emitEvent(bizId, "post.published", {
              source: "webhook", pageId, postId: v.post_id, message: v.message ?? "",
            }).catch(() => {});
            const { runPostTriggersForPost } = await import("@/worker/jobs/postTrigger");
            await runPostTriggersForPost(bizId, pageId, { id: v.post_id ?? "", message: v.message ?? "" });
          }
        } catch (e) {
          console.error("[webhook:meta] change failed", e);
        }
      }
    }
  })().catch((e) => console.error("[webhook:meta] background error", e));

  return Response.json({ ok: true });
}

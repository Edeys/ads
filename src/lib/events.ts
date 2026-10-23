// Event bus outbound — n8n integration. Emit sự kiện trong app → POST sang
// các Outbound Webhook (n8n Webhook node) đã đăng ký nhận loại event đó.
import { db } from "@/db";
import { fetchT } from "./http";
import { outboundWebhooks, outboundEventLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

// Danh mục sự kiện hệ thống phát ra (n8n đăng ký nhận theo tên này)
export const EVENT_CATALOG = [
  { event: "comment.received", label: "Có comment mới trên page", fields: "pageId, postId, commentId, authorName, message" },
  { event: "comment.replied", label: "Đã trả lời comment (thủ công hoặc rule)", fields: "commentId, replyText, byRule" },
  { event: "comment.matched", label: "Comment khớp rule auto-reply", fields: "ruleId, ruleName, commentId, actions" },
  { event: "post.published", label: "Bài đăng tự động đã publish", fields: "postId, pageId, scheduledPostId" },
  { event: "post.publish_failed", label: "Đăng bài tự động thất bại", fields: "scheduledPostId, error" },
  { event: "campaign.paused", label: "Autopilot tắt chiến dịch", fields: "campaignId, cpa, reason" },
  { event: "whitelist.violation", label: "Quảng cáo chạy sai page whitelist", fields: "adId, pageId" },
  { event: "connection.expiring", label: "Token kết nối sắp hết hạn", fields: "connectionId, provider, daysLeft" },
] as const;

export type OutboundEvent = (typeof EVENT_CATALOG)[number]["event"];

export async function emitEvent(bizId: string, event: string, payload: Record<string, unknown>) {
  const hooks = await db.select().from(outboundWebhooks).where(eq(outboundWebhooks.bizId, bizId));
  const matched = hooks.filter((h) => h.enabled && (h.events as string[]).includes(event));
  const deliveries: Promise<void>[] = [];

  for (const h of matched) {
    const t0 = Date.now();
    deliveries.push(
      (async () => {
        const body = JSON.stringify({ event, bizId, ts: new Date().toISOString(), data: payload });
        try {
          const res = await fetchT(h.url, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-adssync-event": event,
              ...(h.secret ? { "x-adssync-secret": h.secret } : {}),
            },
            body,
            signal: AbortSignal.timeout(15_000),
          });
          await db.insert(outboundEventLogs).values({
            bizId, webhookId: h.id, event, ok: res.ok, statusCode: res.status,
            latencyMs: Date.now() - t0, payload,
          }).catch(() => {});
          await db.update(outboundWebhooks).set({
            lastStatus: res.ok ? "ok" : "error",
            lastError: res.ok ? null : `HTTP ${res.status}`,
            lastFiredAt: new Date(),
          }).where(eq(outboundWebhooks.id, h.id)).catch(() => {});
        } catch (e: any) {
          await db.insert(outboundEventLogs).values({
            bizId, webhookId: h.id, event, ok: false,
            latencyMs: Date.now() - t0, payload,
          }).catch(() => {});
          await db.update(outboundWebhooks).set({
            lastStatus: "error", lastError: e?.message ?? "fetch failed", lastFiredAt: new Date(),
          }).where(eq(outboundWebhooks.id, h.id)).catch(() => {});
        }
      })()
    );
  }
  await Promise.allSettled(deliveries);
  return { emitted: event, deliveredTo: matched.length };
}

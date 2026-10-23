// Comment rule engine — xử lý comment mới (từ webhook Meta hoặc polling),
// khớp rule auto-reply rồi thực thi hành động: reply / hide / private reply /
// Telegram / bắn event n8n. Luôn lưu vào commentEvents (cache + audit).
import { db } from "@/db";
import { commentEvents, commentRules, connections, pageSubscriptions } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { replyToComment, setCommentHidden, privateReply } from "./meta-page";
import { telegramSend } from "./notify";
import { emitEvent } from "./events";

export type IncomingComment = {
  bizId: string;
  pageId: string;
  postId: string;
  commentId: string;
  parentCommentId?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  message: string;
  verb?: "add" | "edited" | "remove";
  source?: "webhook" | "poll" | "manual";
  fbCreatedAt?: Date | null;
};

// Tìm credentialId điều khiển page: ưu tiên pageSubscription, fallback scan connection meta.pages
export async function findCredentialForPage(bizId: string, pageId: string) {
  const [sub] = await db
    .select()
    .from(pageSubscriptions)
    .where(and(eq(pageSubscriptions.bizId, bizId), eq(pageSubscriptions.pageId, pageId)))
    .limit(1);
  if (sub) return sub.connectionId;

  const conns = await db.select().from(connections).where(eq(connections.bizId, bizId));
  for (const c of conns) {
    if (c.provider !== "meta_ads") continue;
    const pages = (c.meta as any)?.pages as { id: string }[] | undefined;
    if (pages?.some((p) => p.id === pageId)) return c.id;
  }
  return null;
}

function matchesKeywords(message: string, keywords: string[], mode: "any" | "all") {
  const lower = message.toLowerCase();
  const hits = keywords.map((k) => k.toLowerCase()).filter((k) => k && lower.includes(k));
  return mode === "all" ? hits.length === keywords.length && keywords.length > 0 : hits.length > 0;
}

export async function processIncomingComment(c: IncomingComment) {
  const verb = c.verb ?? "add";
  const source = c.source ?? "webhook";

  // Bỏ qua comment do chính page tạo (tránh vòng lặp reply)
  if (c.authorId && c.authorId === c.pageId) {
    return { skipped: "self_comment" as const };
  }

  // Đã xử lý comment này chưa (webhook Meta có thể gửi lại)
  const [existing] = await db.select().from(commentEvents).where(eq(commentEvents.commentId, c.commentId)).limit(1);
  if (existing && source === "webhook" && verb === "add") {
    return { skipped: "duplicate" as const };
  }

  const credentialId = await findCredentialForPage(c.bizId, c.pageId);

  const values = {
    bizId: c.bizId,
    pageId: c.pageId,
    postId: c.postId,
    commentId: c.commentId,
    parentCommentId: c.parentCommentId ?? null,
    authorId: c.authorId ?? null,
    authorName: c.authorName ?? null,
    message: c.message,
    verb,
    source,
    fbCreatedAt: c.fbCreatedAt ?? null,
  };

  let row: typeof commentEvents.$inferSelect;
  if (existing) {
    const [u] = await db.update(commentEvents).set({ message: c.message, verb, hidden: false }).where(eq(commentEvents.id, existing.id)).returning();
    row = u;
  } else {
    const [ins] = await db.insert(commentEvents).values(values).returning();
    row = ins;
  }

  // Luôn bắn event cho n8n (kể cả khi không khớp rule nào)
  emitEvent(c.bizId, "comment.received", {
    pageId: c.pageId, postId: c.postId, commentId: c.commentId,
    authorId: c.authorId, authorName: c.authorName, message: c.message,
  }).catch(() => {});

  if (verb !== "add" || !credentialId) {
    await db.update(commentEvents).set({ processedAt: new Date(), ruleAction: verb !== "add" ? verb : "no_credential" }).where(eq(commentEvents.id, row.id));
    return { commentEventId: row.id, ruleAction: verb !== "add" ? verb : "no_credential" };
  }

  // ---- Rule matching ----
  const rules = await db
    .select()
    .from(commentRules)
    .where(and(eq(commentRules.bizId, c.bizId), eq(commentRules.enabled, true)))
    .orderBy(asc(commentRules.priority));

  const applicable = rules.filter((r) => !r.pageId || r.pageId === c.pageId);
  const matched = applicable.find((r) => matchesKeywords(c.message, r.keywords as string[], r.matchMode as "any" | "all"));

  if (!matched) {
    await db.update(commentEvents).set({ processedAt: new Date(), ruleAction: "skipped" }).where(eq(commentEvents.id, row.id));
    return { commentEventId: row.id, ruleAction: "skipped" };
  }

  const actions = matched.actions as {
    reply?: string; privateReply?: string; hide?: boolean;
    notifyTelegramConnId?: string; webhookN8n?: boolean;
  };
  const performed: string[] = [];
  let lastError: string | null = null;

  try {
    if (actions.reply) {
      await replyToComment(credentialId, c.commentId, actions.reply, false);
      performed.push("replied");
    }
    if (actions.hide) {
      await setCommentHidden(credentialId, c.commentId, true);
      performed.push("hidden");
    }
    if (actions.privateReply) {
      await privateReply(credentialId, c.commentId, actions.privateReply).catch(() => {
        throw new Error("private_reply_failed");
      });
      performed.push("private_replied");
    }
  } catch (e: any) {
    lastError = e?.message ?? "action_failed";
    performed.push("error");
  }

  if (actions.notifyTelegramConnId) {
    telegramSend(actions.notifyTelegramConnId,
      `💬 Comment khớp rule "${matched.name}"\n👤 ${c.authorName ?? c.authorId ?? "khách"}: "${c.message}"\n🔗 post ${c.postId}`
    ).then(() => { performed.push("notified"); }).catch(() => {});
  }
  if (actions.webhookN8n) {
    emitEvent(c.bizId, "comment.matched", {
      ruleId: matched.id, ruleName: matched.name, commentId: c.commentId,
      pageId: c.pageId, postId: c.postId, message: c.message,
      authorName: c.authorName, actions: performed,
    }).catch(() => {});
  }

  await db.update(commentEvents).set({
    processedAt: new Date(),
    ruleId: matched.id,
    ruleAction: performed.includes("error") ? "error" : performed.join("+") || "skipped",
    replyText: actions.reply ?? null,
    privateReplySent: performed.includes("private_replied"),
    hidden: performed.includes("hidden"),
  }).where(eq(commentEvents.id, row.id));

  await db.update(commentRules).set({ hitCount: (matched.hitCount ?? 0) + 1 }).where(eq(commentRules.id, matched.id));

  return {
    commentEventId: row.id,
    ruleId: matched.id,
    ruleAction: performed.join("+"),
    error: lastError,
  };
}

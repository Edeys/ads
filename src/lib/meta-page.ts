// Meta Page Social API — fork full-feature: quản lý comment + đăng bài tự động.
// Quyền cần khi connect: pages_manage_posts, pages_manage_engagement,
// pages_read_engagement, pages_read_user_engagement, pages_messaging (video: publish_video).
// Tham khảo: developers.facebook.com/documentation/pages-api/posts & comments-mentions.
import { db } from "@/db";
import { assertRealWrites } from "./write-guard";
import { fetchT } from "./http";
import { connections, pageSubscriptions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { decryptSecret } from "./crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

async function userTokenFor(credentialId: string) {
  const [conn] = await db.select().from(connections).where(eq(connections.id, credentialId)).limit(1);
  if (!conn) throw new Error("Credential không tồn tại");
  return { token: decryptSecret((conn.secret as any).enc).access_token, conn };
}

// Lấy Page Access Token từ user token (GET /me/accounts). Có cache trong connection.meta.pageTokens.
export async function pageAccessToken(credentialId: string, pageId: string): Promise<string> {
  const { token } = await userTokenFor(credentialId);
  const res = await fetchT(
    `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${token}`
  );
  const j = (await res.json()) as { data?: { id: string; access_token?: string }[]; error?: { message: string } };
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  const page = j.data?.find((p) => p.id === pageId || p.id === pageId.replace(/^(\d+)_.*/, "$1"));
  if (!page?.access_token) throw new Error(`Không tìm thấy Page Access Token cho page ${pageId} — kiểm tra quyền pages_manage_posts khi kết nối`);
  return page.access_token;
}

// ---------------- Comments ----------------

export async function listPostComments(credentialId: string, postId: string, opts?: { limit?: number; after?: string }) {
  const { token } = await userTokenFor(credentialId);
  const params = new URLSearchParams({
    access_token: token,
    fields: "id,message,created_time,from{id,name},like_count,comment_count,hidden,permalink_url,parent",
    limit: String(opts?.limit ?? 50),
  });
  if (opts?.after) params.set("after", opts.after);
  const res = await fetchT(`${GRAPH}/${postId}/comments?${params}`);
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

export async function listPagePosts(credentialId: string, pageId: string, opts?: { limit?: number }) {
  const { token } = await userTokenFor(credentialId);
  const params = new URLSearchParams({
    access_token: token,
    fields: "id,message,created_time,permalink_url,shares,comments.summary(true),reactions.summary(true),is_eligible_for_promotion",
    limit: String(opts?.limit ?? 25),
  });
  const res = await fetchT(`${GRAPH}/${pageId}/posts?${params}`);
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

// Trả lời công khai: reply comment gốc -> POST /{comment_id}/replies; comment lên post -> POST /{post_id}/comments
export async function replyToComment(credentialId: string, targetId: string, message: string, isReply: boolean) {
  assertRealWrites("Meta trả lời bình luận");
  const token = await pageAccessToken(credentialId, targetId.split("_")[0]);
  const endpoint = isReply ? `${GRAPH}/${targetId}/replies` : `${GRAPH}/${targetId}/comments`;
  const res = await fetchT(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, access_token: token }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

// Ẩn / hiện comment (moderation)
export async function setCommentHidden(credentialId: string, commentId: string, hidden: boolean) {
  assertRealWrites("Meta ẩn/hiện bình luận");
  const token = await pageAccessToken(credentialId, commentId.split("_")[0]);
  const res = await fetchT(`${GRAPH}/${commentId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hidden, access_token: token }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

// Xoá comment do page tạo
export async function deleteComment(credentialId: string, commentId: string) {
  assertRealWrites("Meta xoá bình luận");
  const token = await pageAccessToken(credentialId, commentId.split("_")[0]);
  const res = await fetchT(`${GRAPH}/${commentId}?access_token=${token}`, { method: "DELETE" });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

// Private reply — nhắn tin riêng cho người comment (pages_messaging), 1 lần/comment
export async function privateReply(credentialId: string, commentId: string, message: string) {
  assertRealWrites("Meta gửi tin nhắn riêng");
  const token = await pageAccessToken(credentialId, commentId.split("_")[0]);
  const res = await fetchT(`${GRAPH}/${commentId}/private_replies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, access_token: token }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

// ---------------- Publishing (đăng bài tự động) ----------------

export type PublishInput = {
  message: string;
  linkUrl?: string;
  photos?: string[]; // public URLs (1 ảnh: /photos; nhiều ảnh: unpublished photos + attached_media)
  videoUrl?: string; // public video URL — POST /{page}/videos
  published?: boolean; // false = draft/dark post
  scheduledAt?: Date; // 10 phút – 30 ngày (giới hạn Meta)
};

// Đăng bài lên page feed. Trả về post_id.
export async function publishPagePost(credentialId: string, pageId: string, input: PublishInput) {
  assertRealWrites("Meta đăng bài lên fanpage");
  const token = await pageAccessToken(credentialId, pageId);

  if (input.videoUrl) {
    const form = new FormData();
    form.set("file_url", input.videoUrl);
    form.set("description", input.message);
    form.set("access_token", token);
    if (input.scheduledAt) {
      form.set("published", "false");
      form.set("scheduled_publish_time", Math.floor(input.scheduledAt.getTime() / 1000).toString());
    }
    const res = await fetchT(`${GRAPH}/${pageId}/videos`, { method: "POST", body: form });
    const j = await res.json();
    if (j.error) throw new Error(`Meta: ${j.error.message}`);
    return { postId: j.id };
  }

  // Nhiều ảnh: upload từng ảnh unpublished rồi gắn qua attached_media
  if (input.photos && input.photos.length > 1) {
    const mediaIds: string[] = [];
    for (const url of input.photos.slice(0, 10)) {
      const r = await fetchT(`${GRAPH}/${pageId}/photos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, published: false, access_token: token }),
      });
      const j = await r.json();
      if (j.error) throw new Error(`Meta (photo): ${j.error.message}`);
      mediaIds.push(`{"media_fbid":"${j.id}"}`);
    }
    const body: Record<string, unknown> = {
      message: input.message,
      access_token: token,
      attached_media: JSON.stringify(mediaIds.map((m) => JSON.parse(m))),
    };
    if (input.linkUrl) body.link = input.linkUrl;
    if (input.scheduledAt) {
      body.published = false;
      body.scheduled_publish_time = Math.floor(input.scheduledAt.getTime() / 1000).toString();
    } else if (input.published === false) {
      body.published = false;
    }
    const res = await fetchT(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (j.error) throw new Error(`Meta: ${j.error.message}`);
    return { postId: j.id ?? j.post_id };
  }

  // 1 ảnh hoặc thuần text/link
  if (input.photos && input.photos.length === 1) {
    const body: Record<string, unknown> = {
      url: input.photos[0],
      caption: input.message,
      access_token: token,
    };
    if (input.scheduledAt) {
      body.published = false;
      body.scheduled_publish_time = Math.floor(input.scheduledAt.getTime() / 1000).toString();
    } else if (input.published === false) {
      body.published = false;
    }
    const res = await fetchT(`${GRAPH}/${pageId}/photos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (j.error) throw new Error(`Meta: ${j.error.message}`);
    return { postId: j.post_id ?? j.id };
  }

  const body: Record<string, unknown> = { message: input.message, access_token: token };
  if (input.linkUrl) body.link = input.linkUrl;
  if (input.scheduledAt) {
    body.published = false;
    body.scheduled_publish_time = Math.floor(input.scheduledAt.getTime() / 1000).toString();
  } else if (input.published === false) {
    body.published = false;
  }
  const res = await fetchT(`${GRAPH}/${pageId}/feed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return { postId: j.id ?? j.post_id };
}

// ---------------- Page Webhook subscription (feed: post + comment realtime) ----------------

export async function subscribePageApp(credentialId: string, pageId: string, fields: string[] = ["feed"]) {
  assertRealWrites("Meta đăng ký webhook fanpage");
  const token = await pageAccessToken(credentialId, pageId);
  const res = await fetchT(`${GRAPH}/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscribed_fields: fields.join(","), access_token: token }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

export async function unsubscribePageApp(credentialId: string, pageId: string) {
  assertRealWrites("Meta huỷ webhook fanpage");
  const token = await pageAccessToken(credentialId, pageId);
  const res = await fetchT(`${GRAPH}/${pageId}/subscribed_apps?access_token=${token}`, { method: "DELETE" });
  const j = await res.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}`);
  return j;
}

// Tìm pageSubscription theo pageId (dùng ở webhook route — không cần auth session).
export async function findPageSubscription(pageId: string) {
  const [sub] = await db
    .select()
    .from(pageSubscriptions)
    .where(and(eq(pageSubscriptions.pageId, pageId), eq(pageSubscriptions.status, "active")))
    .limit(1);
  return sub ?? null;
}

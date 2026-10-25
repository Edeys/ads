// Social publish adapters — mỗi mạng một hàm đăng thật theo API công khai.
//
// Tất cả cùng một hợp đồng: (connection, target, payload) → {ok, postId?, url?}
// hoặc throw Error với thông điệp tiếng Việt để owner hiểu ngay lý do.
// Token đọc từ secret đã decrypt; KHÔNG log token.
//
// Tình trạng từng adapter (chi tiết đăng ký app: docs/ADAPTERS.md):
//   instagram   — Graph API, dùng chung token Meta hiện có (không cần app mới)
//   x_twitter   — API v2, cần app X + Bearer user token (OAuth 2.0 PKCE)
//   linkedin    — UGC Posts API v2, cần app LinkedIn
//   tiktok      — Content Posting API (photo PULL_FROM_URL), cần app TikTok duyệt quyền
//   threads     — Threads API (graph.threads.net), cần app Threads/Meta
//   pinterest   — Pins API v5, cần app Pinterest + board id làm đích
import { db } from "@/db";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { fetchT } from "@/lib/http";
import { assertRealWrites } from "@/lib/write-guard";

export type PublishPayload = {
  message: string;
  linkUrl?: string | null;
  photos: string[];
  videoUrl?: string | null;
};

export type PublishResult = { postId: string; url?: string };

export type SocialTarget = { connectionId: string; refId: string | null; label?: string | null };

async function secretFor(connectionId: string): Promise<Record<string, string>> {
  const [conn] = await db.select().from(connections).where(eq(connections.id, connectionId)).limit(1);
  if (!conn) throw new Error("Connection không tồn tại (có thể đã bị xoá)");
  return decryptSecret((conn.secret as any).enc) as Record<string, string>;
}

/** Văn bản đăng = message (+ link xuống dòng nếu có), cắt theo giới hạn từng mạng. */
function composeText(p: PublishPayload, maxLen: number) {
  let text = p.message.trim();
  if (p.linkUrl) text += `\n${p.linkUrl}`;
  if (text.length > maxLen) text = text.slice(0, maxLen - 1) + "…";
  return text;
}

// ------------------------------------------------------------- Instagram ---
// Feed IG cần ảnh/video. Ảnh đầu tiên trong photos làm media, caption là message.
// Yêu cầu token có quyền instagram_content_publish (Facebook Login) và page
// liên kết Instagram Business/Creator account.
export async function publishInstagram(t: SocialTarget, p: PublishPayload): Promise<PublishResult> {
  const igId = t.refId;
  if (!igId) throw new Error("Đích Instagram thiếu IG user id — kết nối lại để tự sinh");
  const media = p.videoUrl || p.photos[0];
  if (!media) throw new Error("Bài Instagram cần ít nhất 1 ảnh hoặc video (photos[0]/videoUrl)");
  const s = await secretFor(t.connectionId);
  const token = s.access_token;
  const GRAPH = "https://graph.facebook.com/v21.0";
  const create = await fetchT(
    `${GRAPH}/${igId}/media?${p.videoUrl ? "video_url" : "image_url"}=${encodeURIComponent(media)}&caption=${encodeURIComponent(composeText(p, 2200))}&access_token=${token}`,
    { method: "POST" },
  ).then((r) => r.json());
  if (!create.id) throw new Error(`IG tạo media lỗi: ${create.error?.message ?? "không rõ"}`);
  const pub = await fetchT(`${GRAPH}/${igId}/media_publish?creation_id=${create.id}&access_token=${token}`, { method: "POST" })
    .then((r) => r.json());
  if (!pub.id) throw new Error(`IG đăng lỗi: ${pub.error?.message ?? "không rõ"}`);
  return { postId: pub.id };
}

// --------------------------------------------------------------- X/Twitter ---
// API v2 POST /2/tweets — text-only (link nằm trong text, X tự render preview).
export async function publishX(t: SocialTarget, p: PublishPayload): Promise<PublishResult> {
  const s = await secretFor(t.connectionId);
  const text = composeText(p, 280);
  const res = await fetchT("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({ text }),
  }).then((r) => r.json());
  const id = res?.data?.id;
  if (!id) throw new Error(`X đăng lỗi: ${res?.detail ?? res?.title ?? JSON.stringify(res).slice(0, 120)}`);
  return { postId: id, url: `https://x.com/i/web/status/${id}` };
}

// ---------------------------------------------------------------- LinkedIn ---
// UGC Posts: shareCommentary là text; link URL nằm trong text (LinkedIn tự preview).
// refId = URN dạng urn:li:person:{id} hoặc urn:li:organization:{id}.
export async function publishLinkedIn(t: SocialTarget, p: PublishPayload): Promise<PublishResult> {
  const s = await secretFor(t.connectionId);
  let author = t.refId;
  if (!author) {
    // Connection thủ công chưa có URN — tự dò qua /v2/userinfo rồi cache lại target.
    const me = await fetchT("https://api.linkedin.com/v2/userinfo", {
      headers: { authorization: `Bearer ${s.access_token}` },
    }).then((r) => r.json());
    if (!me.sub) throw new Error("LinkedIn không đọc được user id từ token");
    author = `urn:li:person:${me.sub}`;
  }
  const body = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: composeText(p, 3000) },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const res = await fetchT("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${s.access_token}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());
  if (!res?.id) throw new Error(`LinkedIn đăng lỗi: ${res?.message ?? "không rõ"}`);
  return { postId: String(res.id).split(":").pop() ?? String(res.id) };
}

// ------------------------------------------------------------------ TikTok ---
// Content Posting API v2 — PHOTO post kéo ảnh từ URL công khai (PULL_FROM_URL).
// Cần 1.. photos; bài chỉ text sẽ bị từ chối với thông báo rõ.
export async function publishTikTok(t: SocialTarget, p: PublishPayload): Promise<PublishResult> {
  if (!p.photos.length) throw new Error("TikTok cần ảnh (photo post) — thêm ít nhất 1 URL ảnh");
  const s = await secretFor(t.connectionId);
  const res = await fetchT("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({
      post_info: {
        title: composeText({ ...p, linkUrl: null }, 2200).split("\n")[0].slice(0, 90) || "Bài đăng",
        description: composeText(p, 2200),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_comment: false,
        video_cover_timestamp_ms: 0,
      },
      source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: p.photos.slice(0, 12) },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    }),
  }).then((r) => r.json());
  if (res?.data?.publish_id) return { postId: res.data.publish_id };
  throw new Error(`TikTok đăng lỗi: ${res?.error?.message ?? JSON.stringify(res).slice(0, 140)}`);
}

// ------------------------------------------------------------------ Threads ---
// Threads API: tạo container (TEXT hoặc IMAGE) rồi publish.
export async function publishThreads(t: SocialTarget, p: PublishPayload): Promise<PublishResult> {
  const s = await secretFor(t.connectionId);
  let userId = t.refId;
  if (!userId) {
    const me = await fetchT("https://graph.threads.net/v1.0/me?fields=id", {
      headers: { authorization: `Bearer ${s.access_token}` },
    }).then((r) => r.json());
    if (!me.id) throw new Error("Threads không đọc được user id từ token");
    userId = me.id;
  }
  const qs = new URLSearchParams({ access_token: s.access_token });
  if (p.photos[0]) {
    qs.set("media_type", "IMAGE");
    qs.set("image_url", p.photos[0]);
    qs.set("caption", composeText(p, 2200));
  } else {
    qs.set("media_type", "TEXT");
    qs.set("text", composeText(p, 2200));
  }
  const container = await fetchT(`https://graph.threads.net/v1.0/${userId}/threads?${qs}`, { method: "POST" })
    .then((r) => r.json());
  if (!container.id) throw new Error(`Threads tạo container lỗi: ${container.error?.message ?? "không rõ"}`);
  const pub = await fetchT(`https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${container.id}&access_token=${s.access_token}`, { method: "POST" })
    .then((r) => r.json());
  if (!pub.id) throw new Error(`Threads đăng lỗi: ${pub.error?.message ?? "không rõ"}`);
  return { postId: pub.id };
}

// ---------------------------------------------------------------- Pinterest ---
// Pin ảnh lên board. refId = board id (UI list boards khi có connection).
export async function publishPinterest(t: SocialTarget, p: PublishPayload): Promise<PublishResult> {
  if (!p.photos[0]) throw new Error("Pinterest Pin cần ảnh — thêm ít nhất 1 URL ảnh");
  if (!t.refId) throw new Error("Đích Pinterest cần board — kết nối lại để chọn board");
  const s = await secretFor(t.connectionId);
  const res = await fetchT("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify({
      board_id: t.refId,
      description: composeText({ ...p, linkUrl: null }, 500),
      link: p.linkUrl ?? undefined,
      media_source: { source_type: "image_url", url: p.photos[0] },
    }),
  }).then((r) => r.json());
  if (!res?.id) throw new Error(`Pinterest đăng lỗi: ${res?.message ?? res?.detail ?? "không rõ"}`);
  return { postId: String(res.id) };
}

/** Đăng theo type — điểm vào duy nhất từ post-targets. */
export async function publishByType(type: string, t: SocialTarget, p: PublishPayload): Promise<PublishResult> {
  // Guard ở tầng helper: worker, MCP, API đều không thể ghi thật khi chế độ an toàn bật.
  assertRealWrites(`Social đăng bài lên ${type}`);
  switch (type) {
    case "instagram": return publishInstagram(t, p);
    case "x_twitter": return publishX(t, p);
    case "linkedin": return publishLinkedIn(t, p);
    case "tiktok": return publishTikTok(t, p);
    case "threads": return publishThreads(t, p);
    case "pinterest": return publishPinterest(t, p);
    default: throw new Error(`Loại đích "${type}" chưa hỗ trợ đăng`);
  }
}

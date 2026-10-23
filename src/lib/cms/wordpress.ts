export interface WordPressPublishInput {
  endpointUrl: string; // ví dụ: https://example.com/wp-json/wp/v2 hoặc https://example.com
  username: string;
  applicationPassword: string; // WordPress Application Password (16-24 ký tự)
  title: string;
  content: string; // HTML hoặc raw text
  status?: "publish" | "draft" | "pending";
  slug?: string;
  excerpt?: string;
}

export interface WordPressPublishResult {
  ok: boolean;
  remotePostId?: string;
  remoteUrl?: string;
  error?: string;
}

export async function publishToWordPress(input: WordPressPublishInput): Promise<WordPressPublishResult> {
  let base = input.endpointUrl.trim().replace(/\/$/, "");
  if (!base.includes("/wp-json")) {
    base = `${base}/wp-json/wp/v2`;
  } else if (!base.includes("/wp/v2")) {
    base = `${base}/wp/v2`;
  }

  const targetUrl = `${base}/posts`;
  const authHeader = `Basic ${Buffer.from(`${input.username}:${input.applicationPassword.replace(/\s+/g, "")}`).toString("base64")}`;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        title: input.title,
        content: input.content,
        status: input.status || "draft",
        slug: input.slug,
        excerpt: input.excerpt,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.message || `Lỗi WordPress HTTP ${res.status}: ${res.statusText}`;
      return { ok: false, error: errMsg };
    }

    return {
      ok: true,
      remotePostId: String(data.id),
      remoteUrl: data.link || data.guid?.rendered,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Không thể kết nối tới website WordPress: ${msg}` };
  }
}

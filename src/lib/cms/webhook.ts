import { checkOutboundUrl } from "@/lib/net-guard";

export interface WebhookPublishInput {
  endpointUrl: string; // URL webhook trên web BĐS: ví dụ https://bds-cuaban.com/api/webhooks/adsync
  webhookSecret?: string; // Khóa bảo mật để web BĐS xác thực
  title: string;
  slug: string;
  contentMarkdown: string;
  contentHtml?: string | null;
  excerpt?: string | null;
  featuredImageUrl?: string | null;
  seoScore?: number | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  focusKeywords?: string[];
  schemaGraph?: Record<string, unknown>;
  publishedAt?: Date | null;
}

export interface WebhookPublishResult {
  ok: boolean;
  remotePostId?: string;
  remoteUrl?: string;
  error?: string;
}

export async function publishToCustomWebhook(input: WebhookPublishInput): Promise<WebhookPublishResult> {
  const targetUrl = input.endpointUrl.trim();
  // Cùng luật SSRF với custom tools: endpoint do người dùng đặt, phải chặn
  // loopback / mạng nội bộ / metadata cloud.
  const guard = await checkOutboundUrl(targetUrl);
  if (!guard.ok) return { ok: false, error: guard.error };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "AdsSync-Headless-CMS/1.0",
  };

  if (input.webhookSecret) {
    headers["X-AdsSync-Secret"] = input.webhookSecret.trim();
  }

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event: "post.published",
        timestamp: new Date().toISOString(),
        post: {
          title: input.title,
          slug: input.slug,
          contentMarkdown: input.contentMarkdown,
          contentHtml: input.contentHtml || input.contentMarkdown,
          excerpt: input.excerpt,
          featuredImageUrl: input.featuredImageUrl,
          seoScore: input.seoScore,
          metaTitle: input.metaTitle,
          metaDescription: input.metaDescription,
          focusKeywords: input.focusKeywords,
          schemaGraph: input.schemaGraph,
          publishedAt: input.publishedAt || new Date().toISOString(),
        },
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.message || `Lỗi Website BĐS phản hồi HTTP ${res.status}: ${res.statusText}`;
      return { ok: false, error: errMsg };
    }

    return {
      ok: true,
      remotePostId: String(data.id || data.postId || input.slug),
      remoteUrl: data.url || data.link,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Không thể gửi webhook sang website BĐS: ${msg}` };
  }
}

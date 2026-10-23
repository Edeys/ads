import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { decryptSecret } from "@/lib/crypto";
import { publishToWordPress } from "@/lib/cms/wordpress";

export const runtime = "nodejs";

// POST /api/biz/:slug/content/posts/:id/publish — Đẩy bài viết sang CMS đích
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const siteId = String(body.siteId ?? "").trim();
  const publishStatus = String(body.status ?? "draft") as "publish" | "draft";

  if (!siteId) {
    return Response.json({ error: "site_id_required" }, { status: 400 });
  }

  // 1. Lấy bài viết
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(and(eq(schema.posts.id, id), eq(schema.posts.bizId, m.biz.id)))
    .limit(1);

  if (!post) {
    return Response.json({ error: "post_not_found" }, { status: 404 });
  }

  // 2. Lấy site
  const [site] = await db
    .select()
    .from(schema.sites)
    .where(and(eq(schema.sites.id, siteId), eq(schema.sites.bizId, m.biz.id)))
    .limit(1);

  if (!site) {
    return Response.json({ error: "site_not_found" }, { status: 404 });
  }

  // 3. Giải mã credentials
  let creds: Record<string, string> = {};
  try {
    creds = decryptSecret(site.credentialsEnc);
  } catch {
    return Response.json({ error: "cannot_decrypt_credentials" }, { status: 500 });
  }

  // 4. Publish theo loại CMS
  if (site.type === "wordpress") {
    const result = await publishToWordPress({
      endpointUrl: site.endpointUrl,
      username: creds.username || "",
      applicationPassword: creds.applicationPassword || creds.password || "",
      title: post.title,
      content: post.contentHtml || post.contentMarkdown,
      status: publishStatus,
      slug: post.slug,
      excerpt: post.excerpt || undefined,
    });

    // 5. Lưu log
    const [log] = await db
      .insert(schema.siteSyncLogs)
      .values({
        bizId: m.biz.id,
        postId: post.id,
        siteId: site.id,
        remotePostId: result.remotePostId,
        remoteUrl: result.remoteUrl,
        syncStatus: result.ok ? "success" : "failed",
        errorLog: result.error,
      })
      .returning();

    if (result.ok) {
      await db
        .update(schema.posts)
        .set({
          status: publishStatus === "publish" ? "published" : "review",
          publishedAt: publishStatus === "publish" ? new Date() : post.publishedAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.posts.id, post.id));

      return Response.json({
        ok: true,
        remoteUrl: result.remoteUrl,
        remotePostId: result.remotePostId,
        logId: log.id,
      });
    } else {
      return Response.json({ ok: false, error: result.error }, { status: 400 });
    }
  }

  return Response.json({ error: `unsupported_site_type_${site.type}` }, { status: 400 });
}

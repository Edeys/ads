import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

function calculateSeoScore(title: string, markdown: string, metaDesc?: string, keywords: string[] = []): number {
  let score = 0;
  if (!title || !markdown) return 0;

  // 1. Tiêu đề (15 điểm): 40 - 70 ký tự
  if (title.length >= 40 && title.length <= 70) score += 15;
  else if (title.length > 20) score += 8;

  // 2. Meta description (15 điểm): 120 - 160 ký tự
  if (metaDesc && metaDesc.length >= 110 && metaDesc.length <= 165) score += 15;
  else if (metaDesc && metaDesc.length > 50) score += 8;

  // 3. Độ dài nội dung (25 điểm)
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 1000) score += 25;
  else if (wordCount >= 600) score += 18;
  else if (wordCount >= 300) score += 10;

  // 4. Cấu trúc tiêu đề con H2/H3 (20 điểm)
  const h2Count = (markdown.match(/^##\s+/gm) || []).length;
  const h3Count = (markdown.match(/^###\s+/gm) || []).length;
  if (h2Count >= 2 && h3Count >= 1) score += 20;
  else if (h2Count >= 1) score += 12;

  // 5. Mật độ từ khóa chính (25 điểm)
  if (keywords.length > 0) {
    const mainKw = keywords[0].toLowerCase();
    const inTitle = title.toLowerCase().includes(mainKw);
    const inBody = markdown.toLowerCase().includes(mainKw);
    if (inTitle && inBody) score += 25;
    else if (inTitle || inBody) score += 15;
  } else {
    score += 10; // Không khai từ khóa thì cho điểm cơ sở
  }

  return Math.min(100, score);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// GET /api/biz/:slug/content/posts — Lấy danh sách bài viết
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const posts = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.bizId, m.biz.id))
    .orderBy(desc(schema.posts.createdAt));

  return Response.json({ posts });
}

// POST /api/biz/:slug/content/posts — Tạo hoặc cập nhật bài viết
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const contentMarkdown = String(body.contentMarkdown ?? "").trim();
  const rawSlug = body.slug ? String(body.slug).trim() : slugify(title);
  const clusterId = body.clusterId || null;
  const postType = String(body.postType ?? "cluster");
  const metaTitle = body.metaTitle ? String(body.metaTitle).trim() : title.slice(0, 160);
  const metaDescription = body.metaDescription ? String(body.metaDescription).trim() : "";
  const focusKeywords = Array.isArray(body.focusKeywords) ? body.focusKeywords : [];
  const status = String(body.status ?? "draft");

  if (!title) {
    return Response.json({ error: "title_required" }, { status: 400 });
  }

  const seoScore = calculateSeoScore(title, contentMarkdown, metaDescription, focusKeywords);

  const [post] = await db
    .insert(schema.posts)
    .values({
      bizId: m.biz.id,
      clusterId,
      postType,
      title,
      slug: rawSlug || `post-${Date.now()}`,
      contentMarkdown,
      seoScore,
      metaTitle,
      metaDescription,
      focusKeywords,
      status,
      publishedAt: status === "published" ? new Date() : null,
    })
    .returning();

  return Response.json({ post });
}

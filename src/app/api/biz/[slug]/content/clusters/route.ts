import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

// GET /api/biz/:slug/content/clusters — Lấy danh sách Topic Clusters
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const clusters = await db
    .select()
    .from(schema.topicClusters)
    .where(eq(schema.topicClusters.bizId, m.biz.id))
    .orderBy(desc(schema.topicClusters.createdAt));

  return Response.json({ clusters });
}

// POST /api/biz/:slug/content/clusters — Tạo mới Topic Cluster
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const pillarKeyword = String(body.pillarKeyword ?? "").trim();
  const searchVolume = Number(body.searchVolume ?? 0);
  const intent = String(body.intent ?? "informational").trim();
  const notes = body.notes ? String(body.notes) : null;

  if (!name || !pillarKeyword) {
    return Response.json({ error: "name_and_pillar_keyword_required" }, { status: 400 });
  }

  const [cluster] = await db
    .insert(schema.topicClusters)
    .values({
      bizId: m.biz.id,
      name,
      pillarKeyword,
      searchVolume,
      intent,
      status: "planning",
      notes,
    })
    .returning();

  return Response.json({ cluster });
}

// Danh sách bài viết page — dùng cho Comment Manager (chọn post để xem comment)
// và Publisher (xem bài đã đăng).
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { listPagePosts } from "@/lib/meta-page";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  const canAccess = m && (m.member.role === "owner" ||
    (m.member.permissions as string[]).includes("comments.access") ||
    (m.member.permissions as string[]).includes("publisher.access"));
  if (!canAccess) return Response.json({ error: "forbidden" }, { status: 403 });

  const u = new URL(req.url);
  const connectionId = u.searchParams.get("connectionId");
  const pageId = u.searchParams.get("pageId");
  if (!connectionId || !pageId) return Response.json({ error: "Thiếu connectionId/pageId" }, { status: 400 });

  // chỉ cho connection thuộc Biz
  const [conn] = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.id, connectionId), eq(schema.connections.bizId, m.biz.id))).limit(1);
  if (!conn) return Response.json({ error: "connection_not_found" }, { status: 404 });

  try {
    const r = await listPagePosts(connectionId, pageId, { limit: Number(u.searchParams.get("limit") ?? 20) });
    return Response.json({ posts: r.data ?? [], paging: r.paging ?? null });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Meta API failed" }, { status: 502 });
  }
}

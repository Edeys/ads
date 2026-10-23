import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

// GET /api/biz/:slug/support/unread — số yêu cầu chưa xử lý (badge sidebar)
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select({ id: schema.supportThreads.id })
    .from(schema.supportThreads)
    .where(and(eq(schema.supportThreads.bizId, m.biz.id), eq(schema.supportThreads.status, "new")));

  return Response.json({ unread: rows.length });
}

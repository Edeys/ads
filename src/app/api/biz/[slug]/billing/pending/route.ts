import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

// GET /api/biz/:slug/billing/pending — hoá đơn chờ thanh toán
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(schema.invoices)
    .where(and(eq(schema.invoices.bizId, m.biz.id), eq(schema.invoices.status, "pending")))
    .orderBy(desc(schema.invoices.createdAt));

  const total = rows.reduce((n, r) => n + r.amount, 0);
  return Response.json({ items: rows, total });
}

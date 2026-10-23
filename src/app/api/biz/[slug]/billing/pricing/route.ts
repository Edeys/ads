import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { PRICING } from "@/lib/pricing";

export const runtime = "nodejs";

// GET /api/biz/:slug/billing/pricing — bảng giá + gói hiện tại
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const [current] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.bizId, m.biz.id))
    .orderBy(desc(schema.plans.startedAt))
    .limit(1);

  return Response.json({ current: current ?? null, plans: PRICING });
}

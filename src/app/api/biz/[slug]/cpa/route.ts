import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  return m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("auto_pause.access")) ? m : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.select().from(schema.cpaThresholds)
    .where(eq(schema.cpaThresholds.bizId, m.biz.id)).orderBy(desc(schema.cpaThresholds.createdAt));
  return Response.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) return Response.json({ error: "Thiếu tên ngưỡng" }, { status: 400 });
  const [row] = await db.insert(schema.cpaThresholds).values({
    bizId: m.biz.id,
    platform: body.platform ?? "meta",
    name: body.name.trim(),
    limits: body.limits ?? {},
    minDataPct: body.minDataPct ?? 120,
    maxPct: body.maxPct ?? 200,
  }).returning();
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "cpa.create", objectType: "cpa_threshold", objectId: row.id });
  return Response.json({ id: row.id });
}

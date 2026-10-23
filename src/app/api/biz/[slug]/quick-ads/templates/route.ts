import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

const OBJECTIVES = [
  "OUTCOME_SALES",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_TRAFFIC",
  "OUTCOME_AWARENESS",
  "OUTCOME_LEADS",
  "OUTCOME_APP_PROMOTION",
] as const;

async function guarded(slug: string) {
  const m = await getMembership(slug);
  const ok = m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("quick_ads.access"));
  return ok ? m! : null;
}

// GET /api/biz/:slug/quick-ads/templates — danh sách mẫu
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await guarded(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(schema.adTemplates)
    .where(eq(schema.adTemplates.bizId, m.biz.id))
    .orderBy(desc(schema.adTemplates.isDefault), desc(schema.adTemplates.createdAt));
  return Response.json(rows);
}

// POST /api/biz/:slug/quick-ads/templates — tạo mẫu
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await guarded(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const objective = String(body.objective ?? "").trim();
  const destination = String(body.destination ?? "").trim();
  const dailyBudget = Number(body.dailyBudget);

  if (!name) return Response.json({ error: "name_required" }, { status: 400 });
  if (!OBJECTIVES.includes(objective as (typeof OBJECTIVES)[number])) {
    return Response.json({ error: "objective_invalid", allowed: OBJECTIVES }, { status: 400 });
  }
  if (!destination) return Response.json({ error: "destination_required" }, { status: 400 });
  if (!Number.isFinite(dailyBudget) || dailyBudget < 1000) {
    return Response.json({ error: "budget_invalid", min: 1000 }, { status: 400 });
  }

  const duplicate = await db
    .select({ id: schema.adTemplates.id })
    .from(schema.adTemplates)
    .where(and(eq(schema.adTemplates.bizId, m.biz.id), eq(schema.adTemplates.name, name)))
    .limit(1);
  if (duplicate.length) return Response.json({ error: "name_duplicated" }, { status: 409 });

  const isDefault = Boolean(body.isDefault);
  if (isDefault) {
    await db.update(schema.adTemplates).set({ isDefault: false }).where(eq(schema.adTemplates.bizId, m.biz.id));
  }

  const [row] = await db
    .insert(schema.adTemplates)
    .values({
      bizId: m.biz.id,
      name,
      objective,
      destination,
      dailyBudget: Math.round(dailyBudget),
      spec: (body.spec ?? {}) as Record<string, unknown>,
      isDefault,
    })
    .returning();

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "ad_template.create",
    objectType: "ad_template",
    objectId: row.id,
    detail: { name, objective, destination, dailyBudget: row.dailyBudget },
  });
  return Response.json(row, { status: 201 });
}

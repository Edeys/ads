import { db, schema } from "@/db";
import { and, eq, ne } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

async function guarded(slug: string) {
  const m = await getMembership(slug);
  const ok = m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("quick_ads.access"));
  return ok ? m! : null;
}

// PATCH /api/biz/:slug/quick-ads/templates/:id — sửa / đặt mặc định
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await guarded(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return Response.json({ error: "name_required" }, { status: 400 });
    patch.name = name;
  }
  if (body.objective !== undefined) patch.objective = String(body.objective);
  if (body.destination !== undefined) patch.destination = String(body.destination);
  if (body.dailyBudget !== undefined) {
    const b = Number(body.dailyBudget);
    if (!Number.isFinite(b) || b < 1000) return Response.json({ error: "budget_invalid" }, { status: 400 });
    patch.dailyBudget = Math.round(b);
  }
  if (body.spec !== undefined) patch.spec = body.spec as Record<string, unknown>;

  if (body.isDefault === true) {
    await db
      .update(schema.adTemplates)
      .set({ isDefault: false })
      .where(and(eq(schema.adTemplates.bizId, m.biz.id), ne(schema.adTemplates.id, id)));
    patch.isDefault = true;
  } else if (body.isDefault === false) {
    patch.isDefault = false;
  }

  if (Object.keys(patch).length === 0) return Response.json({ error: "nothing_to_update" }, { status: 400 });

  const [row] = await db
    .update(schema.adTemplates)
    .set(patch)
    .where(and(eq(schema.adTemplates.id, id), eq(schema.adTemplates.bizId, m.biz.id)))
    .returning();
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "ad_template.update",
    objectType: "ad_template",
    objectId: id,
    detail: { fields: Object.keys(patch) },
  });
  return Response.json(row);
}

// DELETE /api/biz/:slug/quick-ads/templates/:id
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await guarded(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const [row] = await db
    .delete(schema.adTemplates)
    .where(and(eq(schema.adTemplates.id, id), eq(schema.adTemplates.bizId, m.biz.id)))
    .returning();
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "ad_template.delete",
    objectType: "ad_template",
    objectId: id,
    detail: { name: row.name },
  });
  return Response.json({ ok: true });
}

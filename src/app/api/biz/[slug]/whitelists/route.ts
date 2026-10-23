import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Whitelist fanpage — danh sách page được phép giữ nguyên khi Autopilot tắt ads.
 * Lưu dưới dạng connection provider `page_whitelist` với meta { page_id, page_name }.
 */

async function guarded(slug: string) {
  const m = await getMembership(slug);
  if (!m) return null;
  const ok = m.member.role === "owner" || (m.member.permissions as string[]).includes("auto_pause.access");
  return ok ? m : null;
}

// GET /api/biz/:slug/whitelists
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.bizId, m.biz.id), eq(schema.connections.provider, "page_whitelist")))
    .orderBy(desc(schema.connections.createdAt));

  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      page_id: (r.meta as Record<string, unknown>)?.page_id ?? null,
      page_name: r.name,
      created_at: r.createdAt,
    })),
  });
}

// POST /api/biz/:slug/whitelists { page_id, page_name }
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await guarded(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const pageId = String(body.page_id ?? "").trim();
  const pageName = String(body.page_name ?? "").trim();
  if (!pageId) return Response.json({ error: "page_id_required" }, { status: 400 });

  const existing = await db
    .select({ id: schema.connections.id })
    .from(schema.connections)
    .where(and(eq(schema.connections.bizId, m.biz.id), eq(schema.connections.provider, "page_whitelist")));
  if (existing.length >= 50) return Response.json({ error: "whitelist_limit", max: 50 }, { status: 409 });

  const [row] = await db
    .insert(schema.connections)
    .values({
      bizId: m.biz.id,
      provider: "page_whitelist",
      name: pageName || pageId,
      meta: { page_id: pageId, page_name: pageName || pageId },
    })
    .returning();

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "whitelist.add",
    objectType: "whitelist",
    objectId: row.id,
    detail: { page_id: pageId },
  });
  return Response.json({ id: row.id, page_id: pageId, page_name: row.name }, { status: 201 });
}

// DELETE /api/biz/:slug/whitelists?id=...  (hoặc ?page_id=...)
export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await guarded(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const pageId = url.searchParams.get("page_id");
  if (!id && !pageId) return Response.json({ error: "id_or_page_id_required" }, { status: 400 });

  const rows = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.bizId, m.biz.id), eq(schema.connections.provider, "page_whitelist")));
  const target = rows.find((r) => r.id === id || (pageId && (r.meta as Record<string, unknown>)?.page_id === pageId));
  if (!target) return Response.json({ error: "not_found" }, { status: 404 });

  await db.delete(schema.connections).where(eq(schema.connections.id, target.id));
  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "whitelist.remove",
    objectType: "whitelist",
    objectId: target.id,
    detail: { page_id: (target.meta as Record<string, unknown>)?.page_id ?? null },
  });
  return Response.json({ ok: true });
}

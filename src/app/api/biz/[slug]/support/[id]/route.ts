import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

async function load(slug: string, id: string) {
  const m = await getMembership(slug);
  if (!m) return { error: Response.json({ error: "forbidden" }, { status: 403 }) } as const;
  const [row] = await db
    .select()
    .from(schema.supportThreads)
    .where(and(eq(schema.supportThreads.id, id), eq(schema.supportThreads.bizId, m.biz.id)))
    .limit(1);
  if (!row) return { error: Response.json({ error: "not_found" }, { status: 404 }) } as const;
  return { m, row } as const;
}

// GET /api/biz/:slug/support/:id
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await load(slug, id);
  if ("error" in r) return r.error;
  return Response.json(r.row);
}

/**
 * PATCH /api/biz/:slug/support/:id
 * body: { reply?: string, status?: "new"|"seen"|"resolved" }
 * Trả lời được nối vào chuỗi `message` bằng dấu phân cách để giữ 1 bảng duy nhất.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await load(slug, id);
  if ("error" in r) return r.error;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { lastMessageAt: new Date() };

  if (typeof body.reply === "string" && body.reply.trim()) {
    const reply = body.reply.trim();
    if (reply.length > 4000) return Response.json({ error: "reply_too_long" }, { status: 400 });
    patch.message = `${r.row.message}\n\n---\n[Bạn] ${reply}`;
    patch.status = "new";
  }
  if (body.status === "new" || body.status === "seen" || body.status === "resolved") {
    patch.status = body.status;
  }

  const [row] = await db
    .update(schema.supportThreads)
    .set(patch)
    .where(eq(schema.supportThreads.id, id))
    .returning();

  await logActivity({
    bizId: r.m.biz.id,
    actorId: r.m.member.userId,
    action: "support.update",
    objectType: "support_thread",
    objectId: id,
    detail: { status: row.status, replied: Boolean(patch.message) },
  });
  return Response.json(row);
}

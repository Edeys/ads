import { db, schema } from "@/db";
import { and, eq, isNull, or } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

// PATCH /api/biz/:slug/notifications/:id — đánh dấu 1 thông báo đã đọc
export async function PATCH(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const [row] = await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.bizId, m.biz.id),
        or(isNull(schema.notifications.userId), eq(schema.notifications.userId, m.member.userId)),
      ),
    )
    .returning();
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(row);
}

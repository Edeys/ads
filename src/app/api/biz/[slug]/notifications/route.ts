import { db, schema } from "@/db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

// GET /api/biz/:slug/notifications?limit=20&offset=0&unread=1
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const unreadOnly = url.searchParams.get("unread") === "1";

  const scope = and(
    eq(schema.notifications.bizId, m.biz.id),
    or(isNull(schema.notifications.userId), eq(schema.notifications.userId, m.member.userId)),
  );

  const items = await db
    .select()
    .from(schema.notifications)
    .where(unreadOnly ? and(scope, isNull(schema.notifications.readAt)) : scope)
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
    .offset(offset);

  const unreadRows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(scope, isNull(schema.notifications.readAt)));

  return Response.json({ items, unread: unreadRows.length });
}

// PATCH /api/biz/:slug/notifications — đánh dấu tất cả đã đọc
export async function PATCH(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.bizId, m.biz.id),
        or(isNull(schema.notifications.userId), eq(schema.notifications.userId, m.member.userId)),
        isNull(schema.notifications.readAt),
      ),
    );
  return Response.json({ ok: true });
}

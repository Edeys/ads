// Page subscriptions — theo dõi page qua Meta Page Webhooks (field "feed").
// POST: subscribe app vào page (POST /{page}/subscribed_apps) + lưu row kèm verifyToken.
// Client Meta App phải cấu hình Callback URL = {APP_URL}/api/webhooks/meta trước.
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { subscribePageApp, unsubscribePageApp } from "@/lib/meta-page";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  return m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("comments.access")) ? m : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const subs = await db.select().from(schema.pageSubscriptions).where(eq(schema.pageSubscriptions.bizId, m.biz.id));
  // Pages khả dụng từ các connection meta_ads
  const conns = await db.select().from(schema.connections)
    .where(and(eq(schema.connections.bizId, m.biz.id), eq(schema.connections.provider, "meta_ads")));
  const available: { connectionId: string; id: string; name: string }[] = [];
  for (const c of conns) {
    for (const p of ((c.meta as any)?.pages ?? []) as { id: string; name?: string }[]) {
      available.push({ connectionId: c.id, id: p.id, name: p.name ?? p.id });
    }
  }
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return Response.json({
    subscriptions: subs,
    available,
    webhookCallbackUrl: `${appUrl}/api/webhooks/meta`,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.connectionId || !b.pageId) return Response.json({ error: "Thiếu connectionId/pageId" }, { status: 400 });

  const verifyToken = randomBytes(24).toString("hex");
  try {
    await subscribePageApp(b.connectionId, b.pageId, ["feed"]);
  } catch (e: any) {
    return Response.json({ error: `Subscribe page thất bại: ${e?.message} — kiểm tra quyền pages_manage_engagement và đã cấu hình webhook cho Meta App chưa` }, { status: 502 });
  }

  const [row] = await db.insert(schema.pageSubscriptions).values({
    bizId: m.biz.id,
    connectionId: b.connectionId,
    pageId: String(b.pageId),
    pageName: b.pageName ?? null,
    verifyToken,
    subscribedFields: ["feed"],
    status: "active",
  }).returning();
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "page.subscribe", objectType: "page_subscription", objectId: row.id, detail: { pageId: b.pageId } });
  return Response.json({ id: row.id, verifyToken });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Thiếu id" }, { status: 400 });
  const [sub] = await db.select().from(schema.pageSubscriptions).where(eq(schema.pageSubscriptions.id, id)).limit(1);
  if (!sub) return Response.json({ error: "not_found" }, { status: 404 });
  await unsubscribePageApp(sub.connectionId, sub.pageId).catch(() => {});
  await db.delete(schema.pageSubscriptions).where(eq(schema.pageSubscriptions.id, id));
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "page.unsubscribe", objectType: "page_subscription", objectId: id });
  return Response.json({ ok: true });
}

// Outbound webhooks (n8n integration) — CRUD + test ping.
// Mỗi khi app phát event (comment mới, bài publish, campaign tắt...) sẽ POST
// tới các webhook đăng ký đúng event. Header: x-adssync-event, x-adssync-secret.
import { db, schema } from "@/db";
import { eq, desc, and } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { EVENT_CATALOG } from "@/lib/events";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  return m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("events.access")) ? m : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const hooks = await db.select().from(schema.outboundWebhooks)
    .where(eq(schema.outboundWebhooks.bizId, m.biz.id)).orderBy(desc(schema.outboundWebhooks.createdAt));
  const logs = await db.select().from(schema.outboundEventLogs)
    .where(eq(schema.outboundEventLogs.bizId, m.biz.id)).orderBy(desc(schema.outboundEventLogs.createdAt)).limit(50);
  return Response.json({ webhooks: hooks, logs, catalog: EVENT_CATALOG });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));

  if (b.action === "test") {
    if (!b.id) return Response.json({ error: "Thiếu id" }, { status: 400 });
    const { emitEvent } = await import("@/lib/events");
    const r = await emitEvent(m.biz.id, b.event ?? "comment.received", {
      test: true, message: "Đây là sự kiện test từ AdsSync local", at: new Date().toISOString(),
    });
    return Response.json(r);
  }

  if (!b.name?.trim() || !b.url?.trim()) return Response.json({ error: "Thiếu tên/URL webhook" }, { status: 400 });
  if (!/^https?:\/\//.test(b.url)) return Response.json({ error: "URL phải bắt đầu http(s)://" }, { status: 400 });
  const events = (b.events ?? []).filter((e: string) => EVENT_CATALOG.some((c) => c.event === e));
  if (events.length === 0) return Response.json({ error: "Chọn ít nhất một loại event" }, { status: 400 });

  const [row] = await db.insert(schema.outboundWebhooks).values({
    bizId: m.biz.id,
    name: String(b.name).trim(),
    url: String(b.url).trim(),
    secret: b.secret || null,
    events,
    enabled: b.enabled !== false,
  }).returning();
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "webhook.create", objectType: "outbound_webhook", objectId: row.id });
  return Response.json({ id: row.id });
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return Response.json({ error: "Thiếu id" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = String(b.name).trim();
  if (b.url !== undefined) patch.url = String(b.url).trim();
  if (b.secret !== undefined) patch.secret = b.secret || null;
  if (b.events !== undefined) patch.events = (b.events as string[]).filter((e) => EVENT_CATALOG.some((c) => c.event === e));
  if (b.enabled !== undefined) patch.enabled = Boolean(b.enabled);
  await db.update(schema.outboundWebhooks).set(patch).where(eq(schema.outboundWebhooks.id, b.id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Thiếu id" }, { status: 400 });
  await db.delete(schema.outboundWebhooks).where(and(eq(schema.outboundWebhooks.id, id), eq(schema.outboundWebhooks.bizId, m.biz.id)));
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "webhook.delete", objectType: "outbound_webhook", objectId: id });
  return Response.json({ ok: true });
}

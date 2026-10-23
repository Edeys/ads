// Comment auto-reply rules — CRUD (fork full-feature).
// Rule: keywords khớp comment → reply công khai / ẩn / private reply / Telegram / bắn n8n.
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  return m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("comments.access")) ? m : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const rows = await db.select().from(schema.commentRules)
    .where(eq(schema.commentRules.bizId, m.biz.id)).orderBy(schema.commentRules.priority, desc(schema.commentRules.createdAt));
  return Response.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return Response.json({ error: "Thiếu tên rule" }, { status: 400 });
  const keywords = (b.keywords ?? []).map((k: string) => String(k).trim()).filter(Boolean);
  if (keywords.length === 0) return Response.json({ error: "Thiếu từ khoá khớp" }, { status: 400 });
  const actions = b.actions ?? {};
  if (!actions.reply && !actions.privateReply && !actions.hide && !actions.notifyTelegramConnId && !actions.webhookN8n) {
    return Response.json({ error: "Chọn ít nhất một hành động (reply / ẩn / private reply / Telegram / n8n)" }, { status: 400 });
  }
  const [row] = await db.insert(schema.commentRules).values({
    bizId: m.biz.id,
    name: String(b.name).trim(),
    pageId: b.pageId || null,
    matchMode: b.matchMode === "all" ? "all" : "any",
    keywords,
    actions,
    enabled: b.enabled !== false,
    priority: Number(b.priority ?? 100),
  }).returning();
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "comment_rule.create", objectType: "comment_rule", objectId: row.id });
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
  if (b.pageId !== undefined) patch.pageId = b.pageId || null;
  if (b.matchMode !== undefined) patch.matchMode = b.matchMode === "all" ? "all" : "any";
  if (b.keywords !== undefined) patch.keywords = (b.keywords as string[]).map((k) => String(k).trim()).filter(Boolean);
  if (b.actions !== undefined) patch.actions = b.actions;
  if (b.enabled !== undefined) patch.enabled = Boolean(b.enabled);
  if (b.priority !== undefined) patch.priority = Number(b.priority);
  await db.update(schema.commentRules).set(patch).where(eq(schema.commentRules.id, b.id));
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "comment_rule.update", objectType: "comment_rule", objectId: b.id });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Thiếu id" }, { status: 400 });
  await db.delete(schema.commentRules).where(eq(schema.commentRules.id, id));
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "comment_rule.delete", objectType: "comment_rule", objectId: id });
  return Response.json({ ok: true });
}

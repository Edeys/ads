import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

const KINDS = ["support", "bug", "feature"] as const;

// GET /api/biz/:slug/support — danh sách yêu cầu + số chưa xử lý
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("page_size") ?? 25)));
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));

  const rows = await db
    .select()
    .from(schema.supportThreads)
    .where(eq(schema.supportThreads.bizId, m.biz.id))
    .orderBy(desc(schema.supportThreads.lastMessageAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return Response.json({ threads: rows, page, page_size: pageSize });
}

// POST /api/biz/:slug/support — gửi yêu cầu mới
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim();
  const message = String(body.message ?? "").trim();
  const kind = KINDS.includes(body.kind) ? body.kind : "support";

  if (subject.length < 3) return Response.json({ error: "subject_required" }, { status: 400 });
  if (message.length < 10) return Response.json({ error: "message_too_short", min: 10 }, { status: 400 });

  const [row] = await db
    .insert(schema.supportThreads)
    .values({ bizId: m.biz.id, userId: m.member.userId, kind, subject, message })
    .returning();

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "support.create",
    objectType: "support_thread",
    objectId: row.id,
    detail: { kind, subject },
  });
  return Response.json(row, { status: 201 });
}

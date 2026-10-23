import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

const PERM_BY_TYPE: Record<string, string> = {
  metrics_pull: "metric_sync.access",
  auto_pause: "auto_pause.access",
  budget_schedule: "budget_schedules.access",
  post_trigger: "post_triggers.access",
};

async function guard(slug: string, type?: string) {
  const m = await getMembership(slug);
  if (!m) return null;
  if (m.member.role === "owner") return m;
  const perms = m.member.permissions as string[];
  const need = type ? PERM_BY_TYPE[type] : "jobs.access";
  return perms.includes(need) || perms.includes("jobs.access") ? m : null;
}

// GET /api/biz/:slug/configs — list (kèm type filter ?type=)
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await guard(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const type = new URL(req.url).searchParams.get("type");
  const rows = await db.select().from(schema.configs)
    .where(eq(schema.configs.bizId, m.biz.id))
    .orderBy(desc(schema.configs.createdAt));
  return Response.json(type ? rows.filter((r) => r.type === type) : rows);
}

// POST /api/biz/:slug/configs — tạo config
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const m = await guard(slug, body.type);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  if (!["metrics_pull", "auto_pause", "budget_schedule", "post_trigger"].includes(body.type)) {
    return Response.json({ error: "type_invalid" }, { status: 400 });
  }
  if (!body.name?.trim()) return Response.json({ error: "Thiếu tên cấu hình" }, { status: 400 });

  const [row] = await db.insert(schema.configs).values({
    bizId: m.biz.id,
    type: body.type,
    name: body.name.trim(),
    provider: body.provider ?? "facebook",
    credentialId: body.credentialId ?? null,
    intervalMinutes: body.intervalMinutes ?? 30,
    params: body.params ?? {},
    status: "on",
  }).returning();
  await logActivity({ bizId: m.biz.id, actorId: m.member.userId, action: "config.create", objectType: "config", objectId: row.id, detail: { type: body.type } });
  return Response.json({ id: row.id });
}

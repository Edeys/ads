import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import type { Permission } from "@/db/schema";
import { PERMISSIONS } from "@/db/schema";
import { countStaff, getBizPlan, quotaError, quotasEnforced } from "@/lib/plan-quota";

export const runtime = "nodejs";

// GET /api/biz/:slug/invites — danh sách lời mời
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.bizId, m.biz.id))
    .orderBy(desc(schema.invites.createdAt));

  return Response.json(rows);
}

// POST /api/biz/:slug/invites — tạo lời mời
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  if (!isOwner && !perms.includes("team.manage")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return Response.json({ error: "Email không hợp lệ" }, { status: 400 });
  }

  const permissions: Permission[] = Array.isArray(body.permissions)
    ? body.permissions.filter((p: string): p is Permission => PERMISSIONS.includes(p as Permission))
    : [];

  if (quotasEnforced()) {
    const { quota } = await getBizPlan(m.biz.id);
    const staff = await countStaff(m.biz.id);
    if (staff.total + 1 > quota.staff) {
      return quotaError("staff", staff.total, 1, quota.staff);
    }
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 ngày

  const [row] = await db
    .insert(schema.invites)
    .values({
      bizId: m.biz.id,
      email,
      permissions,
      status: "pending",
      expiresAt,
    })
    .returning();

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "invite.create",
    objectType: "invite",
    objectId: row.id,
    detail: { email, permissions },
  });

  return Response.json({ id: row.id, email: row.email, expiresAt: row.expiresAt });
}

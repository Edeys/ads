import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

// GET /api/biz/:slug/settings — lấy thông tin Biz
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.id, m.biz.id)).limit(1);
  if (!biz) return Response.json({ error: "not_found" }, { status: 404 });

  return Response.json({
    id: biz.id,
    slug: biz.slug,
    name: biz.name,
    isPersonal: biz.isPersonal,
    vatTaxCode: biz.vatTaxCode,
    vatCompanyName: biz.vatCompanyName,
    vatCompanyAddress: biz.vatCompanyAddress,
    createdAt: biz.createdAt,
    isOwner: m.member.role === "owner",
  });
}

// PATCH /api/biz/:slug/settings — cập nhật thông tin Biz & VAT
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  if (!isOwner && !perms.includes("team.manage")) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const updateData: Record<string, unknown> = {};

  if (body.name && typeof body.name === "string" && body.name.trim()) {
    updateData.name = body.name.trim();
  }
  if (body.vatTaxCode !== undefined) updateData.vatTaxCode = body.vatTaxCode ? String(body.vatTaxCode).trim() : null;
  if (body.vatCompanyName !== undefined) updateData.vatCompanyName = body.vatCompanyName ? String(body.vatCompanyName).trim() : null;
  if (body.vatCompanyAddress !== undefined) updateData.vatCompanyAddress = body.vatCompanyAddress ? String(body.vatCompanyAddress).trim() : null;

  if (Object.keys(updateData).length === 0) {
    return Response.json({ error: "no_data_to_update" }, { status: 400 });
  }

  await db.update(schema.bizs).set(updateData).where(eq(schema.bizs.id, m.biz.id));

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "biz.update",
    objectType: "biz",
    objectId: m.biz.id,
    detail: updateData,
  });

  return Response.json({ ok: true });
}

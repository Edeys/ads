import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { PRICING } from "@/lib/pricing";

export const runtime = "nodejs";

const CYCLE_DISCOUNT: Record<number, number> = { 3: 0, 6: 5, 12: 10, 24: 25 };

// GET /api/biz/:slug/billing/invoices — danh sách hoá đơn + gói hiện tại
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.bizId, m.biz.id))
    .orderBy(desc(schema.invoices.createdAt))
    .limit(50);

  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

/**
 * POST /api/biz/:slug/billing/invoices
 * body: { tier: "small"|"pro"|"business"|"custom", months?: 3|6|12|24 }
 * Tạo hoá đơn chờ + kích hoạt gói (mô phỏng thanh toán — local không gọi cổng thật).
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const isOwner = m.member.role === "owner";
  const perms = m.member.permissions as string[];
  if (!isOwner && !perms.includes("billing.manage")) {
    return Response.json({ error: "missing_permission" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const tier = PRICING.find((p) => p.tier === body.tier);
  if (!tier) return Response.json({ error: "unknown_tier" }, { status: 400 });
  if (tier.price === null) return Response.json({ error: "contact_required" }, { status: 400 });

  const months = [3, 6, 12, 24].includes(Number(body.months)) ? Number(body.months) : 12;
  const discount = CYCLE_DISCOUNT[months] ?? 0;
  const perMonth = Math.round(tier.price * (1 - discount / 100));
  const total = perMonth * months;

  const [invoice] = await db
    .insert(schema.invoices)
    .values({
      bizId: m.biz.id,
      amount: total,
      currency: "VND",
      detail: { tier: tier.tier, name: tier.name, months, perMonth, discount, mock: true },
      status: "pending",
    })
    .returning();

  // Kích hoạt gói ngay (mô phỏng): hết hạn = hôm nay + số tháng
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + months);
  await db.insert(schema.plans).values({
    bizId: m.biz.id,
    tier: tier.tier,
    quota: tier.quota,
    expiresAt,
    status: "active",
  });

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "billing.subscribe",
    objectType: "invoice",
    objectId: invoice.id,
    detail: { tier: tier.tier, months, total, mock: true },
  });

  return Response.json(
    { invoice: { id: invoice.id, amount: total, status: "pending" }, plan: { tier: tier.tier, expiresAt } },
    { status: 201 },
  );
}

// Gói cước & thanh toán — gói hiện tại + chọn chu kỳ + 4-5 card gói (giống bố cục Done.vn).
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { PRICING } from "@/lib/pricing";
import { BillingClient } from "./client";

export const dynamic = "force-dynamic";

export default async function BillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.bizId, m.biz.id))
    .orderBy(desc(schema.plans.startedAt))
    .limit(1);

  const invoices = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.bizId, m.biz.id))
    .orderBy(desc(schema.invoices.createdAt))
    .limit(5);

  const isOwner = m.member.role === "owner";
  const canPay = isOwner || (m.member.permissions as string[]).includes("billing.manage");

  return (
    <BillingClient
      slug={slug}
      canPay={canPay}
      currentPlan={
        plan
          ? {
              tier: plan.tier,
              quota: plan.quota,
              status: plan.status,
              startedAt: plan.startedAt.toISOString(),
              expiresAt: plan.expiresAt ? plan.expiresAt.toISOString() : null,
            }
          : null
      }
      invoices={invoices.map((i) => ({
        id: i.id,
        amount: Number(i.amount),
        status: i.status,
        detail: i.detail as Record<string, unknown>,
        createdAt: i.createdAt.toISOString(),
      }))}
    />
  );
}

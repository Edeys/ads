import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { TemplatesClient } from "./client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const rows = await db
    .select()
    .from(schema.adTemplates)
    .where(eq(schema.adTemplates.bizId, m.biz.id))
    .orderBy(desc(schema.adTemplates.isDefault), desc(schema.adTemplates.createdAt));

  const canManage =
    m.member.role === "owner" || (m.member.permissions as string[]).includes("quick_ads.access");

  return (
    <TemplatesClient
      slug={slug}
      canManage={canManage}
      rows={rows.map((t) => ({
        id: t.id,
        name: t.name,
        objective: t.objective,
        destination: t.destination,
        dailyBudget: t.dailyBudget,
        isDefault: t.isDefault,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  );
}

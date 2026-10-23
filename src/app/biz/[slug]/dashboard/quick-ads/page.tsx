import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { QuickAdsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function QuickAdsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const [conns, templates] = await Promise.all([
    db.select({ id: schema.connections.id, provider: schema.connections.provider, name: schema.connections.name, meta: schema.connections.meta })
      .from(schema.connections).where(eq(schema.connections.bizId, m.biz.id)),
    db.select().from(schema.adTemplates).where(eq(schema.adTemplates.bizId, m.biz.id)),
  ]);
  return (
    <QuickAdsClient
      slug={slug}
      connections={conns.filter((c) => c.provider === "meta_ads")}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        objective: t.objective,
        destination: t.destination,
        dailyBudget: t.dailyBudget,
      }))}
      realWrites={process.env.ADSYNC_REAL_WRITES === "1"}
    />
  );
}

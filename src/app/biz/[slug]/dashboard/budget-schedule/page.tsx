// Wizard Tăng giảm ngân sách — spec §5.3: 3 bước + summary side.
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { BudgetWizard } from "./client";

export const dynamic = "force-dynamic";

export default async function BudgetSchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const conns = await db.select({
    id: schema.connections.id, provider: schema.connections.provider,
    name: schema.connections.name, meta: schema.connections.meta,
  }).from(schema.connections).where(eq(schema.connections.bizId, m.biz.id));
  return <BudgetWizard slug={slug} connections={conns.filter((c) => c.provider === "meta_ads")} />;
}

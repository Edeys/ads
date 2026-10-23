// Ngưỡng CPA — spec §5.4: tabs theo nền tảng + form 3 nhóm objective.
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { CpaClient } from "./client";

export const dynamic = "force-dynamic";

export default async function CpaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const canManage = m.member.role === "owner" || (m.member.permissions as string[]).includes("auto_pause.access");
  const rows = await db.select().from(schema.cpaThresholds)
    .where(eq(schema.cpaThresholds.bizId, m.biz.id)).orderBy(desc(schema.cpaThresholds.createdAt));
  return <CpaClient slug={slug} canManage={canManage} thresholds={rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }))} />;
}

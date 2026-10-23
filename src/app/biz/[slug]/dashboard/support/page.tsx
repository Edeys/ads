import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { SupportClient } from "./client";

export const dynamic = "force-dynamic";

export default async function SupportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const rows = await db
    .select()
    .from(schema.supportThreads)
    .where(eq(schema.supportThreads.bizId, m.biz.id))
    .orderBy(desc(schema.supportThreads.lastMessageAt))
    .limit(50);

  return (
    <SupportClient
      slug={slug}
      threads={rows.map((t) => ({
        id: t.id,
        kind: t.kind,
        subject: t.subject,
        message: t.message,
        status: t.status,
        adminReply: t.adminReply,
        lastMessageAt: t.lastMessageAt.toISOString(),
      }))}
    />
  );
}

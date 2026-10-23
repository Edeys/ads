// n8n Integration — outbound webhooks + hướng dẫn nối 2 chiều với n8n.
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { N8nClient } from "./client";

export const dynamic = "force-dynamic";

export default async function N8nPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const canManage = m.member.role === "owner" || (m.member.permissions as string[]).includes("events.access");

  const hooks = await db.select().from(schema.outboundWebhooks)
    .where(eq(schema.outboundWebhooks.bizId, m.biz.id)).orderBy(desc(schema.outboundWebhooks.createdAt));
  const logs = await db.select().from(schema.outboundEventLogs)
    .where(eq(schema.outboundEventLogs.bizId, m.biz.id)).orderBy(desc(schema.outboundEventLogs.createdAt)).limit(30);

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return (
    <N8nClient
      slug={slug}
      canManage={canManage}
      webhooks={hooks.map((h) => ({ ...h, lastFiredAt: h.lastFiredAt?.toISOString() ?? null, createdAt: h.createdAt.toISOString() }))}
      logs={logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() }))}
      appUrl={appUrl}
    />
  );
}

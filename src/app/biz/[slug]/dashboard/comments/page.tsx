// Comment Manager — fork full-feature (done.vn không có quản lý comment FB).
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { CommentsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function CommentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const canManage = m.member.role === "owner" || (m.member.permissions as string[]).includes("comments.access");

  const subs = await db.select().from(schema.pageSubscriptions)
    .where(eq(schema.pageSubscriptions.bizId, m.biz.id)).orderBy(desc(schema.pageSubscriptions.createdAt));
  const rules = await db.select().from(schema.commentRules)
    .where(eq(schema.commentRules.bizId, m.biz.id)).orderBy(schema.commentRules.priority);
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.bizId, m.biz.id));

  const telegramConns = conns.filter((c) => c.provider === "telegram").map((c) => ({ id: c.id, name: c.name }));
  const metaConns = conns.filter((c) => c.provider === "meta_ads").map((c) => ({
    id: c.id, name: c.name,
    pages: (((c.meta as any)?.pages ?? []) as { id: string; name?: string }[]).map((p) => ({ id: p.id, name: p.name ?? p.id })),
  }));

  return (
    <CommentsClient
      slug={slug}
      canManage={canManage}
      subscriptions={subs.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), lastEventAt: s.lastEventAt?.toISOString() ?? null }))}
      rules={rules.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
      telegramConns={telegramConns}
      metaConns={metaConns}
    />
  );
}

// Publisher — đăng bài tự động lên Fanpage (fork full-feature).
import { db, schema } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { PublisherClient } from "./client";

export const dynamic = "force-dynamic";

export default async function PublisherPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const canManage = m.member.role === "owner" || (m.member.permissions as string[]).includes("publisher.access");

  const posts = await db.select().from(schema.scheduledPosts)
    .where(eq(schema.scheduledPosts.bizId, m.biz.id)).orderBy(desc(schema.scheduledPosts.createdAt)).limit(100);
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.bizId, m.biz.id));

  const availablePages: { connectionId: string; id: string; name: string }[] = [];
  for (const c of conns.filter((x) => x.provider === "meta_ads")) {
    for (const p of (((c.meta as any)?.pages ?? []) as { id: string; name?: string }[])) {
      availablePages.push({ connectionId: c.id, id: p.id, name: p.name ?? p.id });
    }
  }
  const aiProviders = conns
    .filter((c) => ["gemini", "openai", "anthropic", "deepseek", "openai_compatible"].includes(c.provider))
    .map((c) => ({ id: c.id, name: c.name, provider: c.provider }));

  return (
    <PublisherClient
      slug={slug}
      canManage={canManage}
      pages={availablePages}
      aiProviders={aiProviders}
      posts={posts.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        publishedAt: p.publishedAt?.toISOString() ?? null,
      }))}
    />
  );
}

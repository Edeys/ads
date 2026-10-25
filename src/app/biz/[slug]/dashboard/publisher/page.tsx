// Publisher — đăng bài tự động đa đích, đa mạng (docs/ADAPTERS.md).
import { db, schema } from "@/db";
import { eq, desc, inArray } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { redirect } from "next/navigation";
import { decryptSecret } from "@/lib/crypto";
import { fetchT } from "@/lib/http";
import { PublisherClient } from "./client";

export const dynamic = "force-dynamic";

type Destination = { type: string; connectionId: string; refId: string; label: string; name: string };

export default async function PublisherPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const canManage = m.member.role === "owner" || (m.member.permissions as string[]).includes("publisher.access");

  const posts = await db.select().from(schema.scheduledPosts)
    .where(eq(schema.scheduledPosts.bizId, m.biz.id)).orderBy(desc(schema.scheduledPosts.createdAt)).limit(100);
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.bizId, m.biz.id));

  // Đích của từng bài — chip trạng thái theo đích ở client.
  const targets = posts.length
    ? await db.select().from(schema.scheduledPostTargets)
        .where(inArray(schema.scheduledPostTargets.scheduledPostId, posts.map((p) => p.id)))
    : [];
  const targetsByPost = new Map<string, typeof targets>();
  for (const t of targets) {
    const list = targetsByPost.get(t.scheduledPostId) ?? [];
    list.push(t);
    targetsByPost.set(t.scheduledPostId, list);
  }

  // ---- Đích khả dụng: gom từ mọi mạng đã kết nối ----
  const destinations: Destination[] = [];
  for (const c of conns) {
    if (c.provider === "meta_ads") {
      for (const p of (((c.meta as any)?.pages ?? []) as any[]) ?? []) {
        destinations.push({ type: "meta_page", connectionId: c.id, refId: String(p.id), label: p.name ?? p.id, name: p.name ?? p.id });
        // Page nào gắn Instagram Business → thêm đích IG (dùng chung token Meta).
        if (p.instagram?.id) {
          destinations.push({ type: "instagram", connectionId: c.id, refId: String(p.instagram.id), label: `@${p.instagram.username ?? p.instagram.id}`, name: `IG @${p.instagram.username ?? p.instagram.id}` });
        }
      }
    } else if (["x_twitter", "linkedin", "tiktok", "threads"].includes(c.provider)) {
      destinations.push({
        type: c.provider, connectionId: c.id,
        refId: String((c.meta as any)?.userRef ?? ""),
        label: c.name, name: c.name,
      });
    }
  }
  // Pinterest: mỗi board là một đích (token từ secret; lỗi thì bỏ qua im lặng).
  for (const c of conns.filter((x) => x.provider === "pinterest")) {
    try {
      const token = (decryptSecret((c.secret as any).enc) as any).access_token;
      const boards = await fetchT("https://api.pinterest.com/v5/boards?page_size=30", {
        headers: { authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      for (const b of boards?.items ?? []) {
        destinations.push({ type: "pinterest", connectionId: c.id, refId: String(b.id), label: `📌 ${b.name}`, name: `📌 ${b.name}` });
      }
    } catch { /* board list fail → không chặn trang */ }
  }

  const aiProviders = conns
    .filter((c) => ["gemini", "openai", "anthropic", "deepseek", "openai_compatible"].includes(c.provider))
    .map((c) => ({ id: c.id, name: c.name, provider: c.provider }));

  return (
    <PublisherClient
      slug={slug}
      canManage={canManage}
      destinations={destinations}
      aiProviders={aiProviders}
      posts={posts.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        scheduledAt: p.scheduledAt?.toISOString() ?? null,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        targets: (targetsByPost.get(p.id) ?? []).map((t) => ({
          id: t.id, type: t.type, refId: t.refId, label: t.label,
          status: t.status, postId: t.postId, error: t.error,
        })),
      }))}
    />
  );
}

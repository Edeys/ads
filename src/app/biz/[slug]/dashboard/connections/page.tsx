// Kết nối — spec §5.2: stat row, provider catalog, cards + health, search.
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { defaultScopeKeys, scopeString } from "@/lib/oauth-scopes";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ConnectionsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ success?: string; error?: string; code?: string; msg?: string }>;
}) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");
  const canManage = m.member.role === "owner" || (m.member.permissions as string[]).includes("credentials.access");
  const sp = await searchParams;

  const conns = await db.select({
    id: schema.connections.id,
    provider: schema.connections.provider,
    name: schema.connections.name,
    meta: schema.connections.meta,
    health: schema.connections.health,
    lastCheckedAt: schema.connections.lastCheckedAt,
    createdAt: schema.connections.createdAt,
  }).from(schema.connections)
    .where(eq(schema.connections.bizId, m.biz.id))
    .orderBy(desc(schema.connections.createdAt));

  const isSelfHosted = process.env.SELF_HOSTED === "true";
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const appUrl = (process.env.APP_URL ?? (host ? `http://${host}` : "http://localhost:3000")).replace(/\/$/, "");

  return (
    <ConnectionsClient
      slug={slug}
      canManage={canManage}
      metaOAuthReady={Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET) || isSelfHosted}
      tiktokOAuthReady={Boolean(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET) || isSelfHosted}
      googleOAuthReady={Boolean((process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) && (process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)) || isSelfHosted}
      isSelfHosted={isSelfHosted}
      appUrl={appUrl}
      socialReady={{
        x_twitter: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET),
        linkedin: Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),
        tiktok: Boolean(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET),
        threads: Boolean((process.env.THREADS_CLIENT_ID || process.env.META_APP_ID) && (process.env.THREADS_CLIENT_SECRET || process.env.META_APP_SECRET)),
        pinterest: Boolean(process.env.PINTEREST_CLIENT_ID && process.env.PINTEREST_CLIENT_SECRET),
      }}
      metaAppId={process.env.META_APP_ID ?? null}
      metaScope={scopeString("meta", defaultScopeKeys("meta"))}
      mockReady={process.env.ADSYNC_MOCK !== "0"}
      notice={
        sp.error
          ? {
              kind: "error" as const,
              title: `Kết nối thất bại (${sp.code ?? sp.error})`,
              detail: sp.msg ?? "Nhà cung cấp từ chối cấp quyền.",
            }
          : sp.success
            ? {
                kind: "ok" as const,
                title: `Đã kết nối ${sp.success}`,
                detail: "Kiểm tra quyền và tài khoản quảng cáo bên dưới.",
              }
            : null
      }
      connections={conns.map((c) => ({
        ...c,
        lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}

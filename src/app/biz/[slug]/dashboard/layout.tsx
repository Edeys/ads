// Shell dashboard: sidebar nhóm + top bar.
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";
import { DashboardHeader } from "./header";
import { Sidebar } from "./sidebar";

// Bottom-nav mobile
const MOBILE_NAV = (slug: string) => [
  { href: `/biz/${slug}/dashboard`, label: "Tổng quan" },
  { href: `/biz/${slug}/dashboard/ad-metrics`, label: "Chỉ số" },
  { href: `/biz/${slug}/dashboard/configs`, label: "Tự động" },
  { href: `/biz/${slug}/dashboard/connections`, label: "Kết nối" },
  { href: `/biz/${slug}/dashboard/mcp-keys`, label: "MCP" },
  { href: `/biz/${slug}/settings`, label: "Cài đặt" },
];

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;

  let userBizs: { id: string; name: string; slug: string; isPersonal: boolean }[] = [];
  let currentBizName = slug;
  let tokensIn = 0;
  let tokensOut = 0;

  if (userId) {
    const rows = await db
      .select({
        id: schema.bizs.id,
        name: schema.bizs.name,
        slug: schema.bizs.slug,
        isPersonal: schema.bizs.isPersonal,
      })
      .from(schema.members)
      .innerJoin(schema.bizs, eq(schema.members.bizId, schema.bizs.id))
      .where(eq(schema.members.userId, userId));
    userBizs = rows;
    const cur = rows.find((r) => r.slug === slug);
    if (cur) {
      currentBizName = cur.name;
      const [tok] = await db
        .select({
          tin: sql<number>`coalesce(sum(${schema.aiUsages.tokensIn}), 0)::int`,
          tout: sql<number>`coalesce(sum(${schema.aiUsages.tokensOut}), 0)::int`,
        })
        .from(schema.aiUsages)
        .where(eq(schema.aiUsages.bizId, cur.id));
      tokensIn = Number(tok?.tin ?? 0);
      tokensOut = Number(tok?.tout ?? 0);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--app-bg)" }}>
      <DashboardHeader
        currentSlug={slug}
        currentBizName={currentBizName}
        userBizs={userBizs}
        userEmail={session?.user?.email || "dev@local.test"}
        userName={session?.user?.name || null}
      />
      <div className="flex">
        <Sidebar slug={slug} tokensIn={tokensIn} tokensOut={tokensOut} />
        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">{children}</div>
      </div>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t md:hidden"
        style={{ borderColor: "var(--line)", background: "var(--card)" }}
      >
        {MOBILE_NAV(slug).map((n) => (
          <Link key={n.href} href={n.href} className="flex-1 py-3 text-center text-[11.5px] font-medium" style={{ color: "var(--ink-600)" }}>
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

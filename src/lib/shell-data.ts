// Dữ liệu dùng chung cho shell (header): danh sách biz của user + token AI tháng này.
import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { eq, sql } from "drizzle-orm";

export type ShellBiz = { id: string; name: string; slug: string; isPersonal: boolean };

export async function loadShellData(slug: string) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let userBizs: ShellBiz[] = [];
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

  return {
    userBizs,
    currentBizName,
    tokensIn,
    tokensOut,
    userEmail: session?.user?.email || "dev@local.test",
    userName: session?.user?.name || null,
  };
}

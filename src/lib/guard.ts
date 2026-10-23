import { auth } from "@/lib/auth";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import type { Permission } from "@/db/schema";

export async function getMembership(bizSlug: string) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;
  const rows = await db
    .select({ member: schema.members, biz: schema.bizs })
    .from(schema.members)
    .innerJoin(schema.bizs, eq(schema.members.bizId, schema.bizs.id))
    .where(and(eq(schema.bizs.slug, bizSlug), eq(schema.members.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function hasPerm(bizSlug: string, perm: Permission) {
  const m = await getMembership(bizSlug);
  if (!m) return false;
  if (m.member.role === "owner") return true;
  return (m.member.permissions as string[]).includes(perm);
}

// Dùng trong server components / actions — redirect về login nếu chưa auth,
// throw 403 nếu thiếu quyền.
export async function requirePerm(bizSlug: string, perm: Permission) {
  const ok = await hasPerm(bizSlug, perm);
  if (!ok) throw new Error(`403 — thiếu quyền ${perm}`);
}

import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

// GET /api/biz/:slug/members — list members with user details
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const rows = await db
    .select({
      id: schema.members.id,
      userId: schema.members.userId,
      role: schema.members.role,
      permissions: schema.members.permissions,
      createdAt: schema.members.createdAt,
      userEmail: schema.users.email,
      userName: schema.users.name,
      userImage: schema.users.image,
    })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.members.userId, schema.users.id))
    .where(eq(schema.members.bizId, m.biz.id))
    .orderBy(desc(schema.members.createdAt));

  return Response.json(rows);
}

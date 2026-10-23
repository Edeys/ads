import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// Upsert user theo email + đảm bảo có personal Biz (owner + trial plan).
export async function provisionUser(email: string, name?: string | null, image?: string | null) {
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    [user] = await db.insert(schema.users).values({ email, name, image }).returning();
  }
  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.ownerId, user.id)).limit(1);
  if (!biz) {
    const slug = `biz-${user.id.slice(0, 8)}`;
    const [created] = await db
      .insert(schema.bizs)
      .values({ slug, name: `${name || "My"}'s Biz`, isPersonal: true, ownerId: user.id })
      .returning();
    await db.insert(schema.members).values({
      bizId: created.id,
      userId: user.id,
      role: "owner",
      permissions: [...schema.PERMISSIONS],
    });
    await db.insert(schema.plans).values({ bizId: created.id, tier: "trial" });
  }
  return user;
}

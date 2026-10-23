// Seed lõi dùng chung cho CLI (`npm run seed`) và bootstrap của bản desktop.
// Tách khỏi seed.ts để có thể truyền vào một instance drizzle bất kỳ.
import { eq } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

// PGlite và Postgres dùng session type khác nhau nên nhận union ở dạng lỏng;
// phần seed chỉ gọi select/insert cơ bản.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any | PgliteDatabase<typeof schema>;

export const DEFAULT_EMAIL = "dev@local.test";
export const DEFAULT_SLUG = "my-biz";

export type SeedResult = {
  userId: string;
  bizId: string;
  slug: string;
  created: string[];
};

/** Tạo user dev + biz cá nhân + quyền owner + gói trial + 3 mẫu quảng cáo. Idempotent. */
export async function seedCore(db: DB, log: (msg: string) => void = () => {}): Promise<SeedResult> {
  const created: string[] = [];

  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, DEFAULT_EMAIL)).limit(1);
  if (!user) {
    [user] = await db.insert(schema.users).values({ email: DEFAULT_EMAIL, name: "Dev User" }).returning();
    created.push("user");
    log(`[seed] user ${user.id}`);
  }

  let [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.ownerId, user.id)).limit(1);
  if (!biz) {
    [biz] = await db
      .insert(schema.bizs)
      .values({ slug: DEFAULT_SLUG, name: "My Biz", isPersonal: true, ownerId: user.id })
      .returning();
    created.push("biz");
    log(`[seed] biz ${biz.slug}`);
  }

  const existingMember = await db.select().from(schema.members).where(eq(schema.members.bizId, biz.id)).limit(1);
  if (!existingMember[0]) {
    await db
      .insert(schema.members)
      .values({ bizId: biz.id, userId: user.id, role: "owner", permissions: [...schema.PERMISSIONS] });
    created.push("member");
    log("[seed] owner member");
  }

  const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.bizId, biz.id)).limit(1);
  if (!plan) {
    await db.insert(schema.plans).values({
      bizId: biz.id,
      tier: "custom",
      quota: { tkqc: 999, qlbh: 999, staff: 999, minSyncMinutes: 1 },
      status: "active",
    });
    created.push("plan");
    log("[seed] self-hosted plan (unlimited)");
  }

  const defaults = [
    { name: "Chuyển đổi", objective: "OUTCOME_SALES", destination: "OFFSITE_CONVERSIONS", dailyBudget: 200_000 },
    { name: "Tin nhắn", objective: "OUTCOME_SALES", destination: "MESSAGING_PURCHASE_CONVERSION", dailyBudget: 100_000 },
    { name: "Tương tác", objective: "OUTCOME_ENGAGEMENT", destination: "POST_ENGAGEMENT", dailyBudget: 100_000 },
  ];
  const existing = await db.select().from(schema.adTemplates).where(eq(schema.adTemplates.bizId, biz.id));
  if (!existing.length) {
    await db.insert(schema.adTemplates).values(defaults.map((t) => ({ ...t, bizId: biz.id, isDefault: true })));
    created.push("templates");
    log("[seed] 3 default templates");
  }

  return { userId: user.id, bizId: biz.id, slug: biz.slug, created };
}

// Lưu kết quả OAuth: tạo mới, hoặc cập nhật đúng kết nối khi người dùng bấm
// "Cấp thêm quyền" (state mang theo conn id). Tránh tạo bản ghi trùng mỗi lần
// re-authorize — trước đây mỗi lần cấp thêm quyền lại sinh thêm một connection.
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { encryptSecret } from "./crypto";

export type OAuthProvider =
  | "meta_ads"
  | "google_ads"
  | "tiktok_ads"
  | "google_search_console"
  | "ga4";

export async function saveOAuthConnection(opts: {
  bizId: string;
  existingId?: string | null;
  provider: OAuthProvider;
  name: string;
  secret: Record<string, string>;
  meta: Record<string, unknown>;
}): Promise<{ row: typeof schema.connections.$inferSelect; updated: boolean }> {
  const values = {
    secret: { enc: encryptSecret(opts.secret) },
    meta: opts.meta,
    health: "ok" as const,
    lastCheckedAt: new Date(),
  };

  if (opts.existingId) {
    const [existing] = await db
      .select()
      .from(schema.connections)
      .where(
        and(
          eq(schema.connections.id, opts.existingId),
          eq(schema.connections.bizId, opts.bizId),
          eq(schema.connections.provider, opts.provider),
        ),
      )
      .limit(1);
    if (existing) {
      const [row] = await db
        .update(schema.connections)
        .set(values)
        .where(eq(schema.connections.id, existing.id))
        .returning();
      return { row, updated: true };
    }
  }

  const [row] = await db
    .insert(schema.connections)
    .values({ bizId: opts.bizId, provider: opts.provider, name: opts.name, ...values })
    .returning();
  return { row, updated: false };
}

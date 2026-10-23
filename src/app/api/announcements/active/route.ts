import { db, schema } from "@/db";
import { and, desc, eq, or, isNull, lte, gte } from "drizzle-orm";

export const runtime = "nodejs";

/**
 * GET /api/announcements/active
 * Thông báo hệ thống đang hiển thị (dải promo trên top bar).
 * Không cần đăng nhập biz — chỉ đọc bản ghi còn hiệu lực.
 */
export async function GET() {
  const now = new Date();
  const rows = await db
    .select()
    .from(schema.announcements)
    .where(
      and(
        eq(schema.announcements.active, true),
        lte(schema.announcements.startsAt, now),
        or(isNull(schema.announcements.endsAt), gte(schema.announcements.endsAt, now)),
      ),
    )
    .orderBy(desc(schema.announcements.createdAt))
    .limit(5);

  return Response.json({ items: rows });
}

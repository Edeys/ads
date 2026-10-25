// Danh sách đích đăng khả dụng của một biz — dùng chung bởi UI publisher
// và MCP tool adssync_list_publish_destinations để agent biết chọn gì.
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { fetchT } from "@/lib/http";

export type PublishDestination = {
  type: string;        // meta_page | instagram | x_twitter | linkedin | tiktok | threads | pinterest
  connectionId: string;
  refId: string;       // page id / IG id / user ref / board id (rỗng = adapter tự dò)
  label: string;
};

export async function listPublishDestinations(bizId: string): Promise<PublishDestination[]> {
  const conns = await db.select().from(schema.connections).where(eq(schema.connections.bizId, bizId));
  const out: PublishDestination[] = [];

  for (const c of conns) {
    if (c.provider === "meta_ads") {
      for (const p of (((c.meta as any)?.pages ?? []) as any[]) ?? []) {
        out.push({ type: "meta_page", connectionId: c.id, refId: String(p.id), label: p.name ?? String(p.id) });
        if (p.instagram?.id) {
          out.push({ type: "instagram", connectionId: c.id, refId: String(p.instagram.id), label: `IG @${p.instagram.username ?? p.instagram.id}` });
        }
      }
    } else if (["x_twitter", "linkedin", "tiktok", "threads"].includes(c.provider)) {
      out.push({
        type: c.provider, connectionId: c.id,
        refId: String((c.meta as any)?.userRef ?? ""), label: c.name,
      });
    }
  }
  // Pinterest: mỗi board một đích. Token lỗi thì bỏ qua, không chặn danh sách.
  for (const c of conns.filter((x) => x.provider === "pinterest")) {
    try {
      const token = (decryptSecret((c.secret as any).enc) as any).access_token;
      const boards = await fetchT("https://api.pinterest.com/v5/boards?page_size=30", {
        headers: { authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      for (const b of boards?.items ?? []) {
        out.push({ type: "pinterest", connectionId: c.id, refId: String(b.id), label: `board ${b.name}` });
      }
    } catch { /* bỏ qua */ }
  }
  return out;
}

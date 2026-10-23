// Microsoft Clarity Data Export API.
//
// Giới hạn thật của Clarity: 10 request / project / ngày, dữ liệu chỉ 1–3 ngày
// gần nhất, tối đa 1.000 dòng. Vì vậy mọi kết quả được cache theo tham số trong
// connection.meta — agent gọi lại không đốt quota.
import { db } from "@/db";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";
import { fetchT } from "@/lib/http";

const ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

type CacheEntry = { at: number; key: string; data: unknown };

export async function clarityLiveInsights(
  credentialId: string,
  opts: { numOfDays?: number; dimensions?: string[] } = {},
) {
  const [conn] = await db.select().from(connections).where(eq(connections.id, credentialId)).limit(1);
  if (!conn || conn.provider !== "clarity") throw new Error("Kết nối Clarity không tồn tại");

  const secret = decryptSecret((conn.secret as any).enc);
  const token = secret.api_token ?? secret.access_token ?? "";
  if (!token) throw new Error("Thiếu API token Clarity — kết nối lại.");

  const numOfDays = Math.min(Math.max(Number(opts.numOfDays ?? 1), 1), 3);
  const dimensions = (opts.dimensions ?? []).filter(Boolean).slice(0, 3);
  const params = new URLSearchParams({ numOfDays: String(numOfDays) });
  dimensions.forEach((d, i) => params.set(`dimension${i + 1}`, d));

  const cacheKey = params.toString();
  const meta = (conn.meta ?? {}) as Record<string, unknown>;
  const cache = meta.clarityCache as CacheEntry | undefined;
  // Clarity chỉ có dữ liệu theo ngày → cache 3 giờ là đủ tươi mà vẫn tiết kiệm quota.
  if (cache && cache.key === cacheKey && Date.now() - cache.at < 3 * 3600_000) {
    return { cached: true, cached_at: new Date(cache.at).toISOString(), data: cache.data };
  }

  const res = await fetchT(`${ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const hint =
      res.status === 429
        ? "Clarity đã hết 10 request/ngày cho project này — thử lại sau."
        : "Kiểm tra token tại Clarity → Settings → Data Export.";
    throw new Error(`Clarity API lỗi HTTP ${res.status}. ${hint}`);
  }

  await db
    .update(connections)
    .set({ meta: { ...meta, clarityCache: { at: Date.now(), key: cacheKey, data: body } } })
    .where(eq(connections.id, conn.id))
    .catch(() => {});

  return { cached: false, num_of_days: numOfDays, dimensions, data: body };
}

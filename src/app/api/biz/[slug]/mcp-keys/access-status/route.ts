import { db, schema } from "@/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * GET /api/biz/:slug/mcp-keys/access-status
 * Tình trạng truy cập MCP: tổng key, key hoạt động, key có quyền ghi, lần dùng gần nhất.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const keys = await db.select().from(schema.mcpKeys).where(eq(schema.mcpKeys.bizId, m.biz.id));
  const active = keys.filter((k) => k.status === "active");
  const writeKeys = active.filter((k) => (k.scopes as Record<string, string>)?.write === "true");
  const lastUsed = keys.reduce<Date | null>((acc, k) => {
    if (!k.lastUsedAt) return acc;
    return !acc || k.lastUsedAt > acc ? k.lastUsedAt : acc;
  }, null);

  const [calls] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.mcpCallLogs)
    .innerJoin(schema.mcpKeys, eq(schema.mcpCallLogs.keyId, schema.mcpKeys.id))
    .where(eq(schema.mcpKeys.bizId, m.biz.id));

  return Response.json({
    total_keys: keys.length,
    active_keys: active.length,
    write_keys: writeKeys.length,
    revoked_keys: keys.filter((k) => k.status === "revoked").length,
    last_used_at: lastUsed,
    total_calls: calls?.total ?? 0,
    endpoint: "/mcp",
  });
}

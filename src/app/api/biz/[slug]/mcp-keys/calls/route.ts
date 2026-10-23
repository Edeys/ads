import { db, schema } from "@/db";
import { desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * GET /api/biz/:slug/mcp-keys/calls?limit=40
 * Nhật ký gọi MCP gần nhất (log realtime ở màn API key MCP).
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 40)));

  const rows = await db
    .select({
      id: schema.mcpCallLogs.id,
      tool: schema.mcpCallLogs.tool,
      ok: schema.mcpCallLogs.ok,
      latencyMs: schema.mcpCallLogs.latencyMs,
      createdAt: schema.mcpCallLogs.createdAt,
      keyId: schema.mcpCallLogs.keyId,
      keyName: schema.mcpKeys.name,
    })
    .from(schema.mcpCallLogs)
    .innerJoin(schema.mcpKeys, eq(schema.mcpCallLogs.keyId, schema.mcpKeys.id))
    .where(eq(schema.mcpKeys.bizId, m.biz.id))
    .orderBy(desc(schema.mcpCallLogs.createdAt))
    .limit(limit);

  return Response.json({
    items: rows.map((r) => ({
      id: r.id,
      tool: r.tool,
      ok: r.ok,
      latencyMs: r.latencyMs,
      createdAt: r.createdAt.toISOString(),
      keyId: r.keyId,
      keyName: r.keyName,
    })),
  });
}

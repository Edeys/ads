// Kiểm tra một MCP key ngay trong app: key còn sống không, agent sẽ thấy những
// tool nào, và (tuỳ chọn) gọi thử một tool đọc để xác nhận dữ liệu chảy về.
//
//   POST /api/biz/:slug/mcp-keys/:id/test
//   body: { tool?: string, args?: Record<string, unknown> }
//
// Chỉ cho gọi tool KHÔNG có side effect. Write tool bị chặn vì test không được
// tạo approval rác.
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";
import { listTools, callTool } from "@/mcp/server";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const [key] = await db
    .select()
    .from(schema.mcpKeys)
    .where(and(eq(schema.mcpKeys.id, id), eq(schema.mcpKeys.bizId, m.biz.id)))
    .limit(1);
  if (!key) return Response.json({ error: "not_found" }, { status: 404 });

  if (key.status !== "active") {
    return Response.json({ ok: false, error: "key_inactive", status: key.status }, { status: 400 });
  }
  if (key.expiresAt && key.expiresAt < new Date()) {
    return Response.json({ ok: false, error: "key_expired", expiresAt: key.expiresAt }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const tools = await listTools(key);
  const names = tools.map((t) => t.name);

  let call: { tool: string; ok: boolean; result?: unknown; error?: string } | undefined;
  const toolName = typeof body.tool === "string" ? body.tool.trim() : "";
  if (toolName) {
    const target = tools.find((t) => t.name === toolName);
    if (!target) {
      return Response.json({ ok: false, tools: names, error: "tool_not_allowed" }, { status: 400 });
    }
    // Tool ghi luôn có scope "write" hoặc tên nằm trong nhóm tạo approval.
    if (/^(meta_(reply|hide|publish|schedule|toggle|pause|resume|update|create)_)/.test(toolName)) {
      return Response.json({ ok: false, error: "write_tool_not_testable" }, { status: 400 });
    }
    try {
      const result = await callTool(key, toolName, body.args ?? {});
      call = { tool: toolName, ok: true, result };
    } catch (e: any) {
      call = { tool: toolName, ok: false, error: e?.message ?? String(e) };
    }
  }

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "mcp_key.test",
    objectType: "mcp_key",
    objectId: key.id,
    detail: { tool: toolName || null, toolCount: tools.length, callOk: call?.ok ?? null },
  });

  const ok = !call || call.ok;
  return Response.json({
    ok,
    key: { id: key.id, name: key.name, keyPrefix: key.keyPrefix, status: key.status },
    toolCount: tools.length,
    tools: names,
    ...(call ? { call } : {}),
  });
}

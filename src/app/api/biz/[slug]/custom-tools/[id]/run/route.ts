// Tool SDK — chạy thử một custom tool từ UI (có audit; tool đánh dấu requiresApproval
// vẫn chạy được ở đây vì người bấm là thành viên đã đăng nhập — khác kênh MCP,
// nơi mọi tool có side effect phải tạo approval chờ owner duyệt).
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { runCustomTool, validateArgs } from "@/lib/custom-tools";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const [tool] = await db
    .select()
    .from(schema.customTools)
    .where(and(eq(schema.customTools.id, id), eq(schema.customTools.bizId, m.biz.id)))
    .limit(1);
  if (!tool) return Response.json({ error: "not_found" }, { status: 404 });
  if (!tool.enabled) return Response.json({ error: "tool đang tắt" }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { args?: unknown };
  const checked = validateArgs(tool, body.args);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  const result = await runCustomTool(tool, checked.args);
  const sensitive = /token|secret|password|authorization|api[_-]?key/i;
  const safeArgs = Object.fromEntries(
    Object.entries(checked.args).map(([k, v]) => [k, sensitive.test(k) ? "***" : v]),
  );

  await db.insert(schema.activityLogs).values({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "custom_tool.run",
    status: result.ok ? "success" : "failed",
    objectType: "custom_tool",
    objectId: tool.id,
    detail: { name: tool.name, status: result.status, ms: result.ms, args: safeArgs } as Record<string, unknown>,
  });

  return Response.json({ ...result });
}

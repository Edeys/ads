// Tool SDK — CRUD manifest custom tool (HTTP) cho một Biz.
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { HTTP_METHODS, TOOL_NAME_RE, TOOL_SECRET_REF_RE, normalizeToolName } from "@/lib/custom-tools";

export const runtime = "nodejs";

const DEFAULT_SCHEMA = { type: "object" as const, properties: {}, required: [] };

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return bad("forbidden", 403);

  const rows = await db
    .select()
    .from(schema.customTools)
    .where(eq(schema.customTools.bizId, m.biz.id))
    .orderBy(asc(schema.customTools.createdAt));

  return Response.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return bad("forbidden", 403);
  if (m.member.role !== "owner" && !(m.member.permissions as string[]).includes("mcp_keys.access")) {
    return bad("thiếu quyền mcp_keys.access", 403);
  }

  const body = await req.json().catch(() => null) as any;
  if (!body) return bad("body JSON không hợp lệ");

  const name = normalizeToolName(String(body.name ?? ""));
  if (!TOOL_NAME_RE.test(name)) {
    return bad("tên tool phải là snake_case, 3–60 ký tự, bắt đầu bằng chữ cái");
  }

  const method = String(body.method ?? "GET").toUpperCase();
  if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
    return bad(`method phải là một trong ${HTTP_METHODS.join(", ")}`);
  }

  const url = String(body.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return bad("url phải bắt đầu bằng http:// hoặc https://");

  const inputSchema = body.inputSchema ?? DEFAULT_SCHEMA;
  if (inputSchema?.type !== "object" || typeof inputSchema?.properties !== "object") {
    return bad("inputSchema phải là JSON Schema object");
  }

  const secretRef = body.secretRef ? String(body.secretRef).trim() : null;
  if (secretRef && !TOOL_SECRET_REF_RE.test(secretRef)) {
    return bad("secretRef phải có dạng ADSYNC_TOOL_SECRET_<TÊN> (không dùng secret hệ thống)");
  }

  const [existing] = await db
    .select({ id: schema.customTools.id })
    .from(schema.customTools)
    .where(and(eq(schema.customTools.bizId, m.biz.id), eq(schema.customTools.name, name)))
    .limit(1);
  if (existing) return bad(`tool "${name}" đã tồn tại`, 409);

  try {
    const [row] = await db
      .insert(schema.customTools)
      .values({
        bizId: m.biz.id,
        name,
        description: String(body.description ?? "").slice(0, 2000),
        inputSchema,
        method,
        url,
        headers: body.headers && typeof body.headers === "object" ? body.headers : {},
        bodyTemplate: body.bodyTemplate ? String(body.bodyTemplate) : null,
        secretRef,
        requiresApproval: body.requiresApproval !== false,
        enabled: body.enabled !== false,
        timeoutMs: Math.min(Math.max(Number(body.timeoutMs ?? 10_000), 1_000), 60_000),
      })
      .returning();

    await db.insert(schema.activityLogs).values({
      bizId: m.biz.id,
      actorId: m.member.userId,
      action: "custom_tool.created",
      objectType: "custom_tool",
      objectId: row.id,
      detail: { name: row.name, method, url } as Record<string, unknown>,
    });

    return Response.json(row, { status: 201 });
  } catch (e: any) {
    if (String(e?.message ?? "").includes("custom_tool_biz_name")) {
      return bad(`tool "${name}" đã tồn tại`, 409);
    }
    return bad(String(e?.message ?? e), 500);
  }
}

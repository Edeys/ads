// Tool SDK — sửa / bật-tắt / xoá một custom tool.
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { HTTP_METHODS, TOOL_NAME_RE, TOOL_SECRET_REF_RE, normalizeToolName } from "@/lib/custom-tools";

export const runtime = "nodejs";

async function load(slug: string, id: string) {
  const m = await getMembership(slug);
  if (!m) return { error: Response.json({ error: "forbidden" }, { status: 403 }) } as const;
  const [tool] = await db
    .select()
    .from(schema.customTools)
    .where(and(eq(schema.customTools.id, id), eq(schema.customTools.bizId, m.biz.id)))
    .limit(1);
  if (!tool) return { error: Response.json({ error: "not_found" }, { status: 404 }) } as const;
  return { m, tool } as const;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const found = await load(slug, id);
  if ("error" in found) return found.error;
  const { m, tool } = found;

  if (m.member.role !== "owner" && !(m.member.permissions as string[]).includes("mcp_keys.access")) {
    return Response.json({ error: "thiếu quyền mcp_keys.access" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as any;
  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = normalizeToolName(String(body.name));
    if (!TOOL_NAME_RE.test(name)) return Response.json({ error: "tên tool không hợp lệ" }, { status: 400 });
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = String(body.description).slice(0, 2000);
  if (body.method !== undefined) {
    const method = String(body.method).toUpperCase();
    if (!HTTP_METHODS.includes(method as (typeof HTTP_METHODS)[number])) {
      return Response.json({ error: "method không hợp lệ" }, { status: 400 });
    }
    patch.method = method;
  }
  if (body.url !== undefined) {
    const url = String(body.url).trim();
    if (!/^https?:\/\//i.test(url)) return Response.json({ error: "url không hợp lệ" }, { status: 400 });
    patch.url = url;
  }
  if (body.headers !== undefined) patch.headers = body.headers ?? {};
  if (body.inputSchema !== undefined) patch.inputSchema = body.inputSchema;
  if (body.bodyTemplate !== undefined) patch.bodyTemplate = body.bodyTemplate ? String(body.bodyTemplate) : null;
  if (body.secretRef !== undefined) {
    const secretRef = body.secretRef ? String(body.secretRef).trim() : null;
    if (secretRef && !TOOL_SECRET_REF_RE.test(secretRef)) {
      return Response.json(
        { error: "secretRef phải có dạng ADSYNC_TOOL_SECRET_<TÊN> (không dùng secret hệ thống)" },
        { status: 400 },
      );
    }
    patch.secretRef = secretRef;
  }
  if (body.requiresApproval !== undefined) patch.requiresApproval = Boolean(body.requiresApproval);
  if (body.enabled !== undefined) patch.enabled = Boolean(body.enabled);
  if (body.timeoutMs !== undefined) {
    patch.timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || 10_000, 1_000), 60_000);
  }

  const [row] = await db
    .update(schema.customTools)
    .set(patch)
    .where(eq(schema.customTools.id, tool.id))
    .returning();

  return Response.json(row);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const found = await load(slug, id);
  if ("error" in found) return found.error;
  const { m, tool } = found;

  if (m.member.role !== "owner" && !(m.member.permissions as string[]).includes("mcp_keys.access")) {
    return Response.json({ error: "thiếu quyền mcp_keys.access" }, { status: 403 });
  }

  await db.delete(schema.customTools).where(eq(schema.customTools.id, tool.id));
  await db.insert(schema.activityLogs).values({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "custom_tool.deleted",
    objectType: "custom_tool",
    objectId: tool.id,
    detail: { name: tool.name },
  });
  return Response.json({ ok: true });
}

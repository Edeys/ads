import { db, schema } from "@/db";
import { desc, eq, inArray } from "drizzle-orm";
import { getMembership } from "@/lib/guard";

export const runtime = "nodejs";

// GET — list approvals pending của biz (join qua key)
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const keys = await db.select({ id: schema.mcpKeys.id }).from(schema.mcpKeys).where(eq(schema.mcpKeys.bizId, m.biz.id));
  if (keys.length === 0) return Response.json([]);
  const rows = await db.select().from(schema.mcpApprovals)
    .where(inArray(schema.mcpApprovals.keyId, keys.map((k) => k.id)))
    .orderBy(desc(schema.mcpApprovals.createdAt)).limit(100);
  return Response.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await getMembership(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });
  const { id, action } = await req.json().catch(() => ({}));
  const [ap] = await db.select().from(schema.mcpApprovals).where(eq(schema.mcpApprovals.id, id)).limit(1);
  if (!ap || ap.status !== "pending") return Response.json({ error: "not_found_or_resolved" }, { status: 404 });
  const [key] = await db.select().from(schema.mcpKeys).where(eq(schema.mcpKeys.id, ap.keyId)).limit(1);
  if (!key || key.bizId !== m.biz.id) return Response.json({ error: "forbidden" }, { status: 403 });
  // Recheck trạng thái key NGAY LÚC THỰC THI: key đã bị revoke/hết hạn thì
  // approval pending của nó không chạy nữa, dù owner bấm duyệt.
  if (key.status === "revoked" || (key.expiresAt && key.expiresAt < new Date())) {
    return Response.json({ error: "key đã bị thu hồi hoặc hết hạn — không thực thi được approval này" }, { status: 403 });
  }

  if (action === "reject") {
    await db.update(schema.mcpApprovals).set({ status: "rejected", resolvedBy: m.member.userId, resolvedAt: new Date() }).where(eq(schema.mcpApprovals.id, id));
    return Response.json({ status: "rejected" });
  }
  // approve → execute
  try {
    const { executeApproval } = await import("@/mcp/server");
    const result = await executeApproval(ap.tool, ap.args, { bizId: m.biz.id });
    await db.update(schema.mcpApprovals).set({ status: "executed", result: result as Record<string, unknown>, resolvedBy: m.member.userId, resolvedAt: new Date() }).where(eq(schema.mcpApprovals.id, id));
    return Response.json({ status: "executed", result });
  } catch (e: any) {
    await db.update(schema.mcpApprovals).set({ status: "failed", result: { error: e.message }, resolvedBy: m.member.userId, resolvedAt: new Date() }).where(eq(schema.mcpApprovals.id, id));
    return Response.json({ status: "failed", error: e.message });
  }
}

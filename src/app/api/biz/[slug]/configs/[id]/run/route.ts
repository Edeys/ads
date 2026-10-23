import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";

async function allowed(slug: string) {
  const m = await getMembership(slug);
  return m && (m.member.role === "owner" || (m.member.permissions as string[]).includes("jobs.access")) ? m : null;
}

/**
 * POST /api/biz/:slug/configs/:id/run — "Chạy ngay".
 *
 * Trong app local, đây là chạy THỬ (mock): ghi 1 dòng `config_runs` + cập nhật last_run,
 * KHÔNG gọi Meta/TikTok/Google. Muốn chạy thật phải đi qua Approval Gate.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const m = await allowed(slug);
  if (!m) return Response.json({ error: "forbidden" }, { status: 403 });

  const [config] = await db
    .select()
    .from(schema.configs)
    .where(and(eq(schema.configs.id, id), eq(schema.configs.bizId, m.biz.id)))
    .limit(1);
  if (!config) return Response.json({ error: "not_found" }, { status: 404 });
  if (config.status === "off") return Response.json({ error: "config_off" }, { status: 409 });

  const status = config.status === "error" ? "skipped" : "ok";
  const detail = {
    mocked: true,
    reason: "app_local_mock_run",
    type: config.type,
    provider: config.provider,
    note: "Chạy thử trong app local; không gửi lệnh ghi lên nền tảng quảng cáo.",
  };

  const [run] = await db
    .insert(schema.configRuns)
    .values({
      configId: id,
      startedAt: new Date(),
      finishedAt: new Date(),
      status,
      detail,
    })
    .returning();

  await db
    .update(schema.configs)
    .set({ lastRunAt: new Date(), lastRunStatus: status, lastError: null })
    .where(eq(schema.configs.id, id));

  await logActivity({
    bizId: m.biz.id,
    actorId: m.member.userId,
    action: "config.run",
    objectType: "config",
    objectId: id,
    detail: { mocked: true, runId: run.id, status },
  });

  return Response.json({ ok: true, mocked: true, status, run_id: run.id });
}

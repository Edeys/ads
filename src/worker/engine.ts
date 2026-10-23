// Engine: tick() dispatch configs đến hạn + healthTick() check connections.
// Tách riêng để worker process (setInterval) và /api/dev/tick (in-process, dev PGlite) cùng dùng.
import { db, schema } from "../db";
import { eq, and, ne } from "drizzle-orm";
import { runMetricsPull } from "./jobs/metricsPull";
import { runAutoPause } from "./jobs/autoPause";
import { runBudgetSchedule } from "./jobs/budgetSchedule";
import { runPostTrigger } from "./jobs/postTrigger";
import { checkHealth, readSecret } from "../lib/providers";
import { commentWatchTick, postSchedulerTick } from "./jobs/social";

const runners: Record<string, (cfg: typeof schema.configs.$inferSelect) => Promise<unknown>> = {
  metrics_pull: runMetricsPull,
  auto_pause: runAutoPause,
  budget_schedule: runBudgetSchedule,
  post_trigger: runPostTrigger,
};

// Social: poll comment + đăng bài tự động đến lịch
export async function socialTick() {
  const [comments, posts] = await Promise.allSettled([commentWatchTick(), postSchedulerTick()]);
  return {
    comments: comments.status === "fulfilled" ? comments.value : { error: String(comments.reason) },
    posts: posts.status === "fulfilled" ? posts.value : { error: String(posts.reason) },
  };
}

export async function tick() {
  const now = new Date();
  const due = await db
    .select()
    .from(schema.configs)
    .where(and(eq(schema.configs.status, "on")))
    .then((rows) =>
      rows.filter((c) => !c.lastRunAt || now.getTime() - c.lastRunAt.getTime() >= c.intervalMinutes * 60_000)
    );

  for (const cfg of due) {
    const run = runners[cfg.type];
    if (!run) continue;
    const [rec] = await db.insert(schema.configRuns).values({ configId: cfg.id, status: "ok" }).returning();
    try {
      const detail = await run(cfg);
      await db.update(schema.configRuns).set({ finishedAt: new Date(), detail: (detail ?? {}) as any }).where(eq(schema.configRuns.id, rec.id));
      await db.update(schema.configs).set({ lastRunAt: new Date(), lastRunStatus: "ok", lastError: null }).where(eq(schema.configs.id, cfg.id));
    } catch (e: any) {
      await db.update(schema.configRuns).set({ finishedAt: new Date(), status: "error", error: e.message }).where(eq(schema.configRuns.id, rec.id));
      await db.update(schema.configs).set({ lastRunAt: new Date(), lastRunStatus: "error", lastError: e.message }).where(eq(schema.configs.id, cfg.id));
    }
  }
  return { due: due.length };
}

// Health check mọi connection (trừ disabled) — cập nhật health + lastCheckedAt + meta enrich.
export async function healthTick() {
  const conns = await db.select().from(schema.connections).where(ne(schema.connections.health, "disabled"));
  for (const c of conns) {
    try {
      const secret = (c.secret as any)?.enc ? readSecret((c.secret as any).enc) : {};
      const r = await checkHealth({ provider: c.provider, secret, meta: c.meta as Record<string, unknown> });
      await db.update(schema.connections).set({
        health: r.health,
        lastCheckedAt: new Date(),
        meta: { ...(c.meta as object), ...(r.meta ?? {}) },
      }).where(eq(schema.connections.id, c.id));
    } catch (e) {
      console.error(`[health] ${c.id} failed`, e);
    }
  }
  return { checked: conns.length };
}

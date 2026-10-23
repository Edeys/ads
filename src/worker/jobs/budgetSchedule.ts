import type { schema } from "../../db";
import { db } from "../../db";
import { configs } from "../../db/schema";
import { eq } from "drizzle-orm";
import { metaToken, metaSetBudget, metaGet } from "../../lib/meta-ads";

// Tăng giảm ngân sách theo khung giờ — nhận diện CBO (campaign) / ABO (adset),
// nhớ ngân sách gốc trong params._originalBudget, hết khung giờ trả nguyên trạng.
// params: { adAccountId, targetLevel:'campaign'|'adset', targetId, targetName?, slots:[{from,to,budget}] }
export async function runBudgetSchedule(cfg: typeof schema.configs.$inferSelect) {
  const p = cfg.params as any;
  if (!cfg.credentialId || !p.targetId) throw new Error("Config thiếu credential/target");
  const token = await metaToken(cfg.credentialId);

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const active = (p.slots as { from: string; to: string; budget: number }[] | undefined)?.find((s) => {
    // hỗ trợ slot qua nửa đêm (22:00–06:00)
    return s.from <= s.to ? hhmm >= s.from && hhmm < s.to : hhmm >= s.from || hhmm < s.to;
  });

  const entity = await metaGet(token, p.targetId, "id,name,daily_budget");
  const current = Number(entity.daily_budget ?? 0);

  if (active) {
    if (p._originalBudget === undefined) {
      p._originalBudget = current;
      await db.update(configs).set({ params: p }).where(eq(configs.id, cfg.id));
    }
    if (current !== active.budget) {
      await metaSetBudget(token, p.targetId, active.budget);
      return { applied: true, from: current, to: active.budget, slot: `${active.from}-${active.to}` };
    }
    return { applied: false, reason: "đã đúng ngân sách" };
  }

  // Hết khung giờ → restore
  if (p._originalBudget !== undefined) {
    if (current !== p._originalBudget) {
      await metaSetBudget(token, p.targetId, p._originalBudget);
    }
    const orig = p._originalBudget;
    delete p._originalBudget;
    await db.update(configs).set({ params: p }).where(eq(configs.id, cfg.id));
    return { restored: true, budget: orig };
  }
  return { active: false };
}

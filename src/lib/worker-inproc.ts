// Worker chạy trong chính process của Next (bản desktop).
//
// Vì PGlite chỉ cho phép MỘT process mở thư mục dữ liệu, không thể chạy worker
// thành process riêng như `npm run worker` khi server đang giữ .pgdata.
// Bật bằng ADSYNC_INPROC_WORKER=1 (desktop shell set sẵn).
import { healthTick, socialTick, tick } from "@/worker/engine";

type Ctx = { started: boolean; timers: NodeJS.Timeout[] };
const g = globalThis as unknown as { __adsWorker?: Ctx };

export function startInProcessWorker(log: (msg: string) => void = console.log) {
  if (g.__adsWorker?.started) return g.__adsWorker;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const timers: NodeJS.Timeout[] = [];
  const every = (ms: number, fn: () => Promise<unknown>, label: string) =>
    timers.push(
      setInterval(() => {
        fn().catch((e) => console.error(`[worker] ${label} error`, e));
      }, ms),
    );

  every(30_000, () => tick().then((r) => (r.due ? log(`[worker] tick ${r.due} cấu hình`) : null)), "tick");
  every(15 * 60_000, () => healthTick(), "health");
  every(60_000, () => socialTick(), "social");
  timers.push(
    setTimeout(() => {
      healthTick().catch(() => {});
    }, 10_000),
  );

  log("[worker] in-process scheduler started (tick 30s · health 15m · social 60s)");
  g.__adsWorker = { started: true, timers };
  return g.__adsWorker;
}

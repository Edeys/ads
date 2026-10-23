// Worker process: setInterval quanh engine. Run: npm run worker
// LƯU Ý PGlite: chỉ 1 process mở ./.pgdata — khi `npm run dev` đang chạy,
// dùng POST /api/dev/tick trong app thay vì chạy file này (hoặc set DATABASE_URL → Postgres).
import { tick, healthTick, socialTick } from "./engine";

console.log("[worker] started — tick every 30s, health every 15m, social every 60s");
setInterval(() => tick().then((r) => r.due && console.log(`[tick] ran ${r.due} configs`)).catch((e) => console.error("[worker] tick error", e)), 30_000);
setInterval(() => healthTick().catch((e) => console.error("[worker] health error", e)), 15 * 60_000);
setInterval(() => socialTick().then((r) => console.log("[social]", JSON.stringify(r))).catch((e) => console.error("[worker] social error", e)), 60_000);
setTimeout(() => healthTick().then((r) => console.log(`[health] checked ${r.checked} connections`)).catch(() => {}), 10_000);

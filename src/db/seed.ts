// Seed dev user + personal Biz + trial plan + 3 ad templates mặc định.
// Run: npm run seed
import { db } from "./index";
import { seedCore } from "./seed-core";

async function main() {
  const res = await seedCore(db, console.log);
  console.log(`[seed] done — /biz/${res.slug}/dashboard (tạo mới: ${res.created.join(", ") || "không có"})`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

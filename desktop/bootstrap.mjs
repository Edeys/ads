// Áp migration cho thư mục dữ liệu PGlite TRƯỚC khi server khởi động.
// Chạy bằng node thuần (không qua Next) để không phải bundle TS.
//
//   ADSYNC_DATA_DIR=... ADSYNC_MIGRATIONS_DIR=... node bootstrap.mjs
//
// PGlite chỉ cho một process mở dữ liệu, nên bước này phải chạy xong và đóng
// kết nối trước khi server.js được spawn.
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const dir = process.env.ADSYNC_DATA_DIR?.trim() || "./.pgdata";
const folder = process.env.ADSYNC_MIGRATIONS_DIR?.trim() || "./drizzle";

// Mốc migration gần nhất đã áp. Chỉ backup khi có file migration mới, tránh
// copy cả thư mục dữ liệu ở mỗi lần mở app.
const marker = `${dir}.last-migration`;
const latest = fs.existsSync(folder)
  ? fs.readdirSync(folder).filter((f) => f.endsWith(".sql")).sort().at(-1) ?? ""
  : "";
const applied = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : "";
const hasDb = fs.existsSync(dir) && fs.readdirSync(dir).length > 0;

if (latest && applied !== latest && hasDb) {
  const backup = `${dir}.bak`;
  try {
    if (fs.existsSync(backup)) {
      console.log(`[bootstrap] giữ bản sao lưu trước đó → ${backup}`);
    } else {
      fs.cpSync(dir, backup, { recursive: true });
      console.log(`[bootstrap] đã sao lưu dữ liệu cũ → ${backup}`);
    }
  } catch (err) {
    console.error("[bootstrap] không sao lưu được dữ liệu, dừng để tránh mất dữ liệu:", err);
    process.exit(1);
  }
}

const client = new PGlite(dir);
try {
  await migrate(drizzle(client), { migrationsFolder: folder });
  if (latest) fs.writeFileSync(marker, latest, "utf8");
  console.log(`[bootstrap] migration ok — ${dir}`);
} catch (err) {
  console.error("[bootstrap] migration lỗi:", err);
  process.exitCode = 1;
} finally {
  await client.close();
}

import * as schema from "./schema";

// Thư mục dữ liệu PGlite: mặc định ./.pgdata (self-host), desktop đặt qua ADSYNC_DATA_DIR.
export const dataDir = process.env.ADSYNC_DATA_DIR?.trim() || "./.pgdata";

// Dual driver: DATABASE_URL -> Postgres thật (pg Pool); trống -> PGlite embedded.
function createDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
    const { Pool } = require("pg") as typeof import("pg");
    return drizzle(new Pool({ connectionString: url }), { schema });
  }
  const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  const client = new PGlite(dataDir);
  return drizzle(client, { schema });
}

type DB = ReturnType<typeof createDb>;

// 1) Lazy: chỉ mở DB khi có truy cập thật. `next build` spawn worker import
//    module này để collect page-data — nếu `new PGlite` chạy lúc đó sẽ corrupt
//    ./.pgdata (WASM bị kill giữa chừng). Build phase thì throw rõ ràng.
// 2) globalThis cache: Next dev load module này nhiều route bundle + HMR —
//    PGlite chỉ cho 1 instance trên ./.pgdata, phải share qua globalThis.
const g = globalThis as unknown as { __adsDb?: DB };

function getDb(): DB {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    throw new Error("db không được truy cập trong lúc build");
  }
  return (g.__adsDb ??= createDb());
}

export const db = new Proxy({} as DB, {
  get: (_target, prop) => {
    const v = (getDb() as any)[prop];
    return typeof v === "function" ? v.bind(getDb()) : v;
  },
});
export { schema };

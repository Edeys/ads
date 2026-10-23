// Apply drizzle-kit generated migrations to PGlite (dev) or Postgres (prod).
// Run: npm run db:migrate
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

async function main() {
  const client = new PGlite("./.pgdata");
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[db] migrations applied");
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

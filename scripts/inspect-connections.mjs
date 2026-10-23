// Liệt kê connection trong .pgdata + giải mã secret để biết token thật hay mock.
// CHỈ chạy khi server ĐÃ TẮT (PGlite 1 process).
//
//   node scripts/inspect-connections.mjs
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

function loadEnv(file) {
  const out = {};
  try {
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  } catch {}
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...process.env };
const secret = env.NEXTAUTH_SECRET || env.AUTH_SECRET;
const key = createHash("sha256").update(secret || "dev-secret").digest();

function decrypt(payload) {
  try {
    const [iv, tag, data] = payload.split(".").map((s) => Buffer.from(s, "base64"));
    const d = createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

const db = new PGlite(env.ADSYNC_DATA_DIR || "./.pgdata");
const rows = await db.query(
  "SELECT provider, name, health, secret, meta FROM connections ORDER BY provider",
);
for (const r of rows.rows) {
  const s = r.secret ? decrypt(r.secret) : null;
  const tok = s?.access_token || s?.api_token || "";
  const kind = tok.startsWith("mock_") ? "MOCK" : s?.refresh_token ? "REAL(refresh)" : tok ? "REAL(access)" : "EMPTY";
  const meta = r.meta && typeof r.meta === "object" ? Object.keys(r.meta).join(",") : "";
  console.log(`${r.provider.padEnd(24)} ${String(r.health).padEnd(6)} ${kind.padEnd(15)} ${r.name}  ${meta ? `[${meta}]` : ""}`);
}
await db.close();

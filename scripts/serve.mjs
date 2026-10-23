// Chạy AdsSync bản production trên máy local (web self-host).
//
// Vì `next.config.ts` bật `output: "standalone"`, KHÔNG dùng `next start` được.
// Script này làm đúng 3 bước:
//   1) stage static/public/drizzle + PGlite vào .next/standalone
//   2) áp migration PGlite trước khi mở server (PGlite chỉ cho 1 process)
//   3) spawn `node .next/standalone/server.js` với env từ .env
//
// Dùng: npm run build && npm run serve:prod
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const standalone = join(root, ".next", "standalone");
const serverJs = join(standalone, "server.js");

function log(msg) {
  console.log(`[serve] ${msg}`);
}
function fail(msg) {
  console.error(`\n[serve] ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- 1) stage --
if (!existsSync(serverJs)) {
  fail("Chưa có .next/standalone/server.js — chạy `npm run build` trước.");
}

for (const [from, to] of [
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
  [join(root, "public"), join(standalone, "public")],
  [join(root, "drizzle"), join(standalone, "drizzle")],
]) {
  if (!existsSync(from)) continue;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

// Next trace có thể bỏ sót WASM/data của PGlite.
const pglite = join(root, "node_modules", "@electric-sql", "pglite");
if (existsSync(pglite)) {
  const dest = join(standalone, "node_modules", "@electric-sql", "pglite");
  rmSync(dest, { recursive: true, force: true });
  cpSync(pglite, dest, { recursive: true });
}

// ---------------------------------------------------------------- 2) env ----
// Đọc .env (không override biến đã có trong process) để server.js nhận đúng
// NEXTAUTH_SECRET, APP_URL, ADSYNC_* giống lúc chạy dev.
function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = {
  ...loadEnvFile(join(root, ".env")),
  ...loadEnvFile(join(root, ".env.local")),
};
const env = { ...fileEnv, ...process.env };

const port = env.PORT || "3000";
const hostname = env.HOSTNAME || "127.0.0.1";
env.PORT = port;
env.HOSTNAME = hostname;
env.ADSYNC_DATA_DIR = env.ADSYNC_DATA_DIR || join(root, ".pgdata");
env.ADSYNC_MIGRATIONS_DIR = env.ADSYNC_MIGRATIONS_DIR || join(root, "drizzle");

if (!env.NEXTAUTH_SECRET && !env.AUTH_SECRET) {
  fail("Thiếu NEXTAUTH_SECRET trong .env — không mã hoá được credential.");
}

log(`data dir: ${env.ADSYNC_DATA_DIR}`);
log(`node: ${process.version} · port ${port} · host ${hostname}`);

// --------------------------------------------------------- 3) migration -----
async function applyMigrations() {
  // Chạy bootstrap từ repo gốc để Node resolve được @electric-sql/pglite và
  // drizzle-orm từ node_modules đầy đủ (bản standalone có thể thiếu).
  const src = join(root, "desktop", "bootstrap.mjs");
  if (!existsSync(src)) fail("Không thấy desktop/bootstrap.mjs để áp migration.");

  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [src], { cwd: root, env, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`migration exit ${code}`))));
    child.on("error", reject);
  });
}

// ------------------------------------------------------------- 4) server ----
// Kiểm tra cổng trước khi spawn: PGlite chỉ cho 1 process, nên chạy trùng sẽ
// làm hỏng dữ liệu/health. Báo lỗi rõ ràng thay vì EADDRINUSE khó hiểu.
async function portInUse(port) {
  const net = await import("node:net");
  return new Promise((resolvePort) => {
    const socket = net.connect({ port: Number(port), host: "127.0.0.1" });
    const done = (result) => {
      socket.destroy();
      resolvePort(result);
    };
    socket.setTimeout(700);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function main() {
  if (await portInUse(port)) {
    fail(`Cổng ${port} đang được dùng — AdsSync có thể đã chạy sẵn. Dừng process cũ trước khi chạy lại.`);
  }

  await applyMigrations();

  let child = null;
  let stopping = false;
  let restarts = 0;
  const MAX_RESTARTS = 5;

  const startChild = () => {
    child = spawn(process.execPath, [serverJs], { cwd: root, env, stdio: "inherit" });
    child.on("exit", (code, signal) => {
      if (stopping) return;
      if (signal) {
        log(`server dừng bởi ${signal}`);
        process.exit(0);
      }
      if (code === 0) {
        log("server thoát bình thường");
        process.exit(0);
      }
      restarts += 1;
      if (restarts > MAX_RESTARTS) {
        log(`server thoát với mã ${code} — đã thử ${MAX_RESTARTS} lần, dừng.`);
        process.exit(code ?? 1);
      }
      const wait = Math.min(30, 3 * restarts);
      log(`server thoát với mã ${code} — khởi động lại sau ${wait}s (lần ${restarts}/${MAX_RESTARTS})`);
      setTimeout(startChild, wait * 1000);
    });
  };

  startChild();

  process.on("SIGINT", () => {
    stopping = true;
    child?.kill("SIGINT");
    setTimeout(() => process.exit(0), 3000);
  });
  process.on("SIGTERM", () => {
    stopping = true;
    child?.kill("SIGTERM");
    setTimeout(() => process.exit(0), 3000);
  });
}

main().catch((err) => fail(err?.message ?? String(err)));

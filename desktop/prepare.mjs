// Chuẩn bị gói server cho bản desktop:
//   1) kiểm tra output standalone (.next/standalone/server.js)
//   2) copy static + public + drizzle vào standalone
//   3) stage sang desktop/src-tauri/resources/app
//   4) copy node.exe thành sidecar binaries/node-<triple>.exe
//
// Chạy: npm run build && node desktop/prepare.mjs
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const standalone = join(root, ".next", "standalone");
const stageApp = join(here, "src-tauri", "resources", "app");
const binaries = join(here, "src-tauri", "binaries");

function fail(msg) {
  console.error(`\n[prepare] ${msg}\n`);
  process.exit(1);
}

function triple() {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  return `${arch}-unknown-linux-gnu`;
}

if (!existsSync(join(standalone, "server.js"))) {
  fail("Chưa có .next/standalone/server.js — chạy `npm run build` trước (next.config.ts đã bật output: standalone).");
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tr = triple();

// --- 1) Bổ sung phần Next không tự copy vào standalone -------------------------
for (const [from, to] of [
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
  [join(root, "public"), join(standalone, "public")],
  [join(root, "drizzle"), join(standalone, "drizzle")],
]) {
  if (!existsSync(from)) continue;
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`[prepare] + ${to.replace(root + "\\", "").replace(root + "/", "")}`);
}

// PGlite nạp WASM/data từ node_modules — trace của Next có thể bỏ sót, copy nguyên package.
const pglite = join(root, "node_modules", "@electric-sql", "pglite");
if (existsSync(pglite)) {
  const dest = join(standalone, "node_modules", "@electric-sql", "pglite");
  rmSync(dest, { recursive: true, force: true });
  cpSync(pglite, dest, { recursive: true });
  console.log("[prepare] + node_modules/@electric-sql/pglite (wasm/data)");
}

// bootstrap.mjs chạy bằng node thuần nên cần `drizzle-orm` thật (Next bundle
// không để lại package này trong standalone).
const drizzleOrm = join(root, "node_modules", "drizzle-orm");
if (existsSync(drizzleOrm)) {
  const dest = join(standalone, "node_modules", "drizzle-orm");
  rmSync(dest, { recursive: true, force: true });
  cpSync(drizzleOrm, dest, { recursive: true });
  console.log("[prepare] + node_modules/drizzle-orm (migrator cho bootstrap)");
}

// Script áp migration chạy trước server (node thuần, không qua Next).
cpSync(join(here, "bootstrap.mjs"), join(standalone, "bootstrap.mjs"));
console.log("[prepare] + bootstrap.mjs");

// --- 2) Stage sang resources/app --------------------------------------------
rmSync(stageApp, { recursive: true, force: true });
mkdirSync(stageApp, { recursive: true });
cpSync(standalone, stageApp, { recursive: true });

// Xoá cache route của Next: nếu không, bản đóng gói có thể phục vụ HTML cũ
// (vd trang /login còn nút "Dev login" sau khi đã bỏ provider dev).
rmSync(join(stageApp, ".next", "cache"), { recursive: true, force: true });
rmSync(join(stageApp, ".next", "server", "route-cache"), { recursive: true, force: true });
rmSync(join(stageApp, ".next", "server", "pages"), { recursive: true, force: true });

console.log(`[prepare] staged -> ${stageApp}`);

writeFileSync(
  join(stageApp, ".adsync-build.json"),
  JSON.stringify(
    {
      app: "adsync",
      version: pkg.version,
      builtAt: new Date().toISOString(),
      node: process.version,
      triple: tr,
    },
    null,
    2,
  ),
  "utf8",
);

// --- 3) Node runtime thành sidecar ------------------------------------------
mkdirSync(binaries, { recursive: true });
const nodeSrc = process.execPath;
const nodeDest = join(binaries, `node-${tr}${process.platform === "win32" ? ".exe" : ""}`);
cpSync(nodeSrc, nodeDest);
console.log(`[prepare] node runtime -> ${nodeDest} (${(statSync(nodeDest).size / 1024 / 1024).toFixed(1)} MB)`);

const total = (() => {
  let bytes = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else bytes += statSync(p).size;
    }
  };
  walk(stageApp);
  return bytes;
})();
console.log(`[prepare] app payload: ${(total / 1024 / 1024).toFixed(1)} MB`);
console.log("[prepare] xong. Build app: cd desktop && npm run desktop:build (cần Rust + tauri-cli)");

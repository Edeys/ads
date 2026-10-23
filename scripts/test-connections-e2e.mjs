// End-to-end test cho luồng kết nối quảng cáo (Meta/Google/TikTok).
//
// Chạy với app desktop đang mở:
//   node scripts/test-connections-e2e.mjs
//
// Tạo kết nối sandbox rồi test đọc số liệu (chỉ khi mock mode đang bật):
//   node scripts/test-connections-e2e.mjs --create-mock
//
// Tùy chọn:
//   --base=http://127.0.0.1:3210
//   --slug=biz-c1db5d8b
//   --uid=<user-id> --email=<email>
//   --cookie=<authjs.session-token>   (bỏ qua bước tự ký JWT)
//   --secret-file=<đường dẫn secret.txt>
//
// Script chỉ xóa các kết nối do chính nó tạo; không đụng kết nối thật.
import fs from "node:fs";
import path from "node:path";
import { encode } from "next-auth/jwt";

const argv = process.argv.slice(2);
const opts = Object.fromEntries(
  argv.map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.length ? rest.join("=") : "1"];
  }),
);

const BASE = opts.base ?? "http://127.0.0.1:3210";
const SLUG = opts.slug ?? "biz-c1db5d8b";
const UID = opts.uid ?? "c1db5d8b-5de6-480f-aee3-c2e3c56cb6c5";
const EMAIL = opts.email ?? "xuanloi.me@gmail.com";
const SECRET_FILE =
  opts["secret-file"] ?? path.join(process.env.APPDATA || process.env.HOME || ".", "AdsSync", "secret.txt");
const CREATE_MOCK = opts["create-mock"] === "1" || opts["create-mock"] === "true";

let cookie = opts.cookie ? `authjs.session-token=${opts.cookie}` : "";
if (!cookie) {
  const secret = fs.readFileSync(SECRET_FILE, "utf8").trim();
  const salt = "authjs.session-token";
  const token = await encode({
    token: { uid: UID, sub: UID, email: EMAIL, name: "E2E Session" },
    secret,
    salt,
    maxAge: 3600,
  });
  cookie = `${salt}=${token}`;
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

async function req(p, init = {}) {
  const res = await fetch(BASE + p, {
    redirect: "manual",
    ...init,
    headers: { cookie, ...(init.headers ?? {}) },
  });
  return res;
}

async function json(res) {
  return res.json().catch(() => null);
}

// 1) Session + mode
const health = await req("/api/health");
const healthJson = await json(health);
check("health", health.status === 200 && healthJson?.ok === true, `mock=${healthJson?.mock} real_writes=${healthJson?.real_writes}`);
const mockMode = healthJson?.mock !== false;

const sess = await req("/api/auth/session");
const sessJson = await json(sess);
check("session", sess.status === 200 && sessJson?.user?.email === EMAIL, sessJson?.user?.email ?? "no session");

// 2) Diagnostics from the same endpoint the UI uses
for (const provider of ["meta", "google", "tiktok"]) {
  const res = await req(`/api/biz/${SLUG}/connections/diagnose?provider=${provider}`);
  const body = await json(res);
  check(`diagnose ${provider}`, res.status === 200 && Array.isArray(body?.checks), `status ${res.status}, ${body?.checks?.length ?? 0} checks`);
}

// 3) OAuth start URL for each provider
for (const provider of ["meta", "google", "tiktok"]) {
  const res = await req(`/api/connect/${provider}/start?slug=${SLUG}`);
  const loc = res.headers.get("location") ?? "";
  const ok = res.status === 302 || res.status === 307 || res.status === 503;
  check(`start ${provider}`, ok, `status ${res.status}${loc ? " -> " + loc.slice(0, 140) : ""}`);
}

// 4) Optional sandbox connections + read path
const before = await req(`/api/biz/${SLUG}/connections`).then(json);
const beforeIds = new Set((Array.isArray(before) ? before : before?.connections ?? []).map((r) => r.id));
const created = [];

if (CREATE_MOCK) {
  if (!mockMode) {
    console.log("SKIP  create mock connections — app is in production mode (ADSYNC_MOCK=0)");
  } else {
    for (const provider of ["meta", "google", "tiktok"]) {
      const start = await req(`/api/connect/${provider}/start?slug=${SLUG}&mock=1`);
      const cb = start.headers.get("location") ?? "";
      if (!cb) {
        check(`mock start ${provider}`, false, `status ${start.status}, no redirect`);
        continue;
      }
      const cbUrl = new URL(cb);
      const cbRes = await req(cbUrl.pathname + cbUrl.search);
      const result = cbRes.headers.get("location") ?? "";
      check(`mock callback ${provider}`, cbRes.status === 307 || cbRes.status === 302, result.slice(0, 160));
    }

    const after = await req(`/api/biz/${SLUG}/connections`).then(json);
    const rows = Array.isArray(after) ? after : after?.connections ?? [];
    for (const row of rows) {
      if (!beforeIds.has(row.id)) created.push(row);
    }
    check("mock connections created", created.length >= 1, `${created.length} new rows`);
  }
}

// 5) Sources + real/mock query for every account currently available
const sourcesRes = await req(`/api/biz/${SLUG}/ad-metrics/sources`);
const sources = await json(sourcesRes);
const platforms = sources?.platforms ?? [];
check("ad metric sources", sourcesRes.status === 200 && Array.isArray(platforms), `${platforms.length} platforms`);

for (const p of platforms) {
  const accounts = (p.accounts ?? []).slice(0, 10);
  let ok = 0;
  let rows = 0;
  for (const account of accounts) {
    const q = await req(`/api/biz/${SLUG}/ad-metrics/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        platform: p.platform,
        level: "campaign",
        account_keys: [account.account_key],
        range: { preset: "this_year" },
        metrics: ["spend", "impressions", "clicks"],
        refresh: true,
      }),
    });
    const body = await json(q);
    if (q.status === 200 && Array.isArray(body?.rows)) {
      ok++;
      rows += body.rows.length;
    } else {
      console.log(`      ${account.account_id}: status ${q.status} ${body?.detail ?? ""}`.slice(0, 220));
    }
  }
  check(`ad query ${p.platform}`, accounts.length > 0 && ok === accounts.length, `${ok}/${accounts.length} accounts, ${rows} rows`);
}

// 6) Re-authorization must update the existing row, not create a duplicate
const metaRow = created.find((r) => r.provider === "meta_ads");
if (mockMode && metaRow) {
  const grant = await req(`/api/biz/${SLUG}/connections/${metaRow.id}/scopes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keys: ["instagram_basic"] }),
  });
  const grantJson = await json(grant);
  if (grantJson?.url) {
    const u = new URL(grantJson.url);
    const start = await req(u.pathname + u.search + "&mock=1");
    const cb = start.headers.get("location") ?? "";
    if (cb) {
      const cbUrl = new URL(cb);
      await req(cbUrl.pathname + cbUrl.search);
    }
    const after = await req(`/api/biz/${SLUG}/connections`).then(json);
    const rows2 = Array.isArray(after) ? after : after?.connections ?? [];
    const metaRows = rows2.filter((r) => r.provider === "meta_ads" && !beforeIds.has(r.id));
    check("regrant updates existing connection", metaRows.length === 1 && metaRows[0].id === metaRow.id, `${metaRows.length} new meta rows`);
    for (const r of rows2) {
      if (!beforeIds.has(r.id) && !created.some((c) => c.id === r.id)) created.push(r);
    }
  } else {
    check("regrant start url", false, JSON.stringify(grantJson).slice(0, 160));
  }
}

// 7) Scopes + recheck for newly created rows, then clean up only those rows
for (const row of created) {
  const scopes = await req(`/api/biz/${SLUG}/connections/${row.id}/scopes`);
  const scopesJson = await json(scopes);
  check(`scopes ${row.provider}`, scopes.status === 200 && Array.isArray(scopesJson?.scopes), `status ${scopes.status}`);

  const recheck = await req(`/api/biz/${SLUG}/connections/${row.id}/recheck`, { method: "POST" });
  check(`recheck ${row.provider}`, recheck.status === 200 || recheck.status === 502, `status ${recheck.status}`);

  const del = await req(`/api/biz/${SLUG}/connections/${row.id}`, { method: "DELETE" });
  check(`cleanup ${row.provider}`, del.status === 200 || del.status === 204, `status ${del.status}`);
}

// 7) MCP OAuth discovery (connections are exposed to AI clients through MCP)
const mcp = await req("/mcp/oauth/metadata");
const mcpJson = await json(mcp);
check("mcp oauth metadata", mcp.status === 200 && Boolean(mcpJson?.authorization_endpoint), `status ${mcp.status}`);

console.log(`\n${failures ? `${failures} test(s) failed` : "All connection tests passed"}`);
process.exitCode = failures ? 1 : 0;

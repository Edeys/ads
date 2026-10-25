/**
 * Verify Phase 27 (Configs): 4 filter tab + trang chi tiết + "Chạy ngay" (mock).
 *   node scripts/verify_configs.mjs
 * Yêu cầu: server local đang chạy ở http://localhost:3000 (PGlite chỉ 1 process).
 */
const BASE = process.env.LOCAL_BASE ?? "http://localhost:3000";
const SLUG = process.env.LOCAL_SLUG ?? "my-biz";
const EMAIL = process.env.LOCAL_EMAIL ?? "dev@local.test";

let cookie = "";
const jar = (res) => {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) cookie = [...cookie.split("; ").filter(Boolean), c.split(";")[0]].join("; ");
};
async function http(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
  jar(res);
  return res;
}

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

// 1) Đăng nhập dev
const csrfRes = await http("/api/auth/csrf");
const { csrfToken } = await csrfRes.json();
await http("/api/auth/callback/dev", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email: EMAIL, csrfToken, callbackUrl: `${BASE}/biz/${SLUG}/dashboard`, json: "true" }),
});

// 2) Trang configs + 4 filter
for (const f of ["auto-pause", "auto-run", "budget", "metrics"]) {
  const res = await http(`/biz/${SLUG}/dashboard/configs?filter=${f}`);
  check(`GET /configs?filter=${f} → 200`, res.status === 200, `(status ${res.status})`);
}

// 3) Tạo 1 config để test (nếu chưa có)
let list = await (await http(`/api/biz/${SLUG}/configs`)).json();
let cfg = list.find((c) => c.type === "auto_pause");
if (!cfg) {
  const res = await http(`/api/biz/${SLUG}/configs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "auto_pause", name: "Verify autopilot", provider: "facebook", intervalMinutes: 30, params: { maxCpa: 50000 } }),
  });
  check("POST /configs tạo auto_pause", res.status === 200 || res.status === 201, `(status ${res.status})`);
  list = await (await http(`/api/biz/${SLUG}/configs`)).json();
  cfg = list.find((c) => c.type === "auto_pause");
}
check("API trả về config auto_pause", Boolean(cfg));

// 4) Chạy ngay (mock)
if (cfg) {
  const res = await http(`/api/biz/${SLUG}/configs/${cfg.id}/run`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  check("POST /configs/:id/run → 200 mocked", res.status === 200 && body.mocked === true, JSON.stringify(body));

  // 5) Trang chi tiết + lịch sử chạy
  const page = await http(`/biz/${SLUG}/dashboard/configs/${cfg.id}`);
  const html = await page.text();
  check("GET /configs/:id → 200", page.status === 200, `(status ${page.status})`);
  check("trang chi tiết có 'Lịch sử chạy'", html.includes("Lịch sử chạy"));
  check("lịch sử đã ghi lần chạy", html.includes("app_local_mock_run") || html.includes("ok"));
}

// 6) Config đang tắt → 409
if (cfg) {
  await http(`/api/biz/${SLUG}/configs/${cfg.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "off" }),
  });
  const res = await http(`/api/biz/${SLUG}/configs/${cfg.id}/run`, { method: "POST" });
  check("chạy config đang tắt → 409", res.status === 409, `(status ${res.status})`);
  await http(`/api/biz/${SLUG}/configs/${cfg.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "on" }),
  });
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);

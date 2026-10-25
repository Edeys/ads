/**
 * Verify Phase 28 (Quick Ads): CRUD mẫu quảng cáo + phát hành ở chế độ mô phỏng.
 *   node scripts/verify_quick_ads.mjs
 * Yêu cầu: server local đang chạy ở http://localhost:3000 (PGlite chỉ 1 process).
 */
const BASE = process.env.LOCAL_BASE ?? "http://localhost:3000";
const SLUG = process.env.LOCAL_SLUG ?? "my-biz";
const EMAIL = process.env.LOCAL_EMAIL ?? "dev@local.test";

let cookie = "";
async function http(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
    redirect: "manual",
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = [...cookie.split("; ").filter(Boolean), ...set.map((c) => c.split(";")[0])].join("; ");
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

const { csrfToken } = await (await http("/api/auth/csrf")).json();
await http("/api/auth/callback/dev", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email: EMAIL, csrfToken, callbackUrl: `${BASE}/biz/${SLUG}/dashboard`, json: "true" }),
});

// Trang
check("GET /quick-ads → 200", (await http(`/biz/${SLUG}/dashboard/quick-ads`)).status === 200);
check("GET /quick-ads/templates → 200", (await http(`/biz/${SLUG}/dashboard/quick-ads/templates`)).status === 200);

// Danh sách
const list0 = await (await http(`/api/biz/${SLUG}/quick-ads/templates`)).json();
check("GET templates trả mảng", Array.isArray(list0), JSON.stringify(list0).slice(0, 120));

// Tạo
const name = `Verify mẫu ${Date.now()}`;
const created = await http(`/api/biz/${SLUG}/quick-ads/templates`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name, objective: "OUTCOME_SALES", destination: "OFFSITE_CONVERSIONS", dailyBudget: 350000 }),
});
const tpl = await created.json();
check("POST template → 201", created.status === 201, `(status ${created.status}) ${JSON.stringify(tpl).slice(0, 120)}`);
check("template có id + đúng budget", Boolean(tpl.id) && tpl.dailyBudget === 350000);

// Trùng tên
const dup = await http(`/api/biz/${SLUG}/quick-ads/templates`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name, objective: "OUTCOME_SALES", destination: "OFFSITE_CONVERSIONS", dailyBudget: 100000 }),
});
check("tạo trùng tên → 409 name_duplicated", dup.status === 409 && (await dup.json()).error === "name_duplicated");

// Validate
const badBudget = await http(`/api/biz/${SLUG}/quick-ads/templates`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: `${name} bad`, objective: "OUTCOME_SALES", destination: "ON_POST", dailyBudget: 10 }),
});
check("budget < 1.000 → 400 budget_invalid", badBudget.status === 400 && (await badBudget.json()).error === "budget_invalid");

const badObjective = await http(`/api/biz/${SLUG}/quick-ads/templates`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: `${name} obj`, objective: "SALES", destination: "ON_POST", dailyBudget: 100000 }),
});
check("objective sai → 400 objective_invalid", badObjective.status === 400);

// Sửa + đặt mặc định
const patched = await http(`/api/biz/${SLUG}/quick-ads/templates/${tpl.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: `${name} (sửa)`, isDefault: true }),
});
const patchedBody = await patched.json();
check("PATCH template → 200 + tên mới", patched.status === 200 && patchedBody.name.endsWith("(sửa)"));
check("PATCH isDefault → true", patchedBody.isDefault === true);

const list1 = await (await http(`/api/biz/${SLUG}/quick-ads/templates`)).json();
check("chỉ còn 1 mẫu mặc định", list1.filter((t) => t.isDefault).length === 1);

// Phát hành (mock)
const publish = await http(`/api/biz/${SLUG}/quick-ads`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    credentialId: "mock_credential",
    adAccountId: "act_mock",
    pageId: "page_mock",
    postId: "post_mock",
    templateId: tpl.id,
  }),
});
const pub = await publish.json();
check("POST quick-ads → 200 mocked", publish.status === 200 && pub.mocked === true, JSON.stringify(pub).slice(0, 160));
check("campaign tạo ở PAUSED", pub.status === "PAUSED");
check("campaign id là mock_", String(pub.campaignId).startsWith("mock_campaign_"));

const missing = await http(`/api/biz/${SLUG}/quick-ads`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ credentialId: "x", adAccountId: "y" }),
});
check("thiếu tham số → 400", missing.status === 400);

const badTpl = await http(`/api/biz/${SLUG}/quick-ads`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    credentialId: "x",
    adAccountId: "y",
    pageId: "p",
    postId: "q",
    templateId: "00000000-0000-0000-0000-000000000000",
  }),
});
check("template không tồn tại → 404", badTpl.status === 404);

// Xoá
check("DELETE template → 200", (await http(`/api/biz/${SLUG}/quick-ads/templates/${tpl.id}`, { method: "DELETE" })).status === 200);
const gone = await http(`/api/biz/${SLUG}/quick-ads/templates/${tpl.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "x" }),
});
check("PATCH mẫu đã xoá → 404", gone.status === 404);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);

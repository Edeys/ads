/**
 * Verify các API "khung" còn thiếu so với Done.vn (Phase 29–31):
 * notifications, announcements, support, whitelists, mcp scopes/catalog/status,
 * billing pricing/pending, ai-models.
 *   node scripts/verify_shell_apis.mjs
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

// --- notifications ---
const notif = await (await http(`/api/biz/${SLUG}/notifications?limit=5`)).json();
check("GET notifications trả {items, unread}", Array.isArray(notif.items) && typeof notif.unread === "number", JSON.stringify(notif).slice(0, 120));
check("PATCH notifications đánh dấu đã đọc", (await http(`/api/biz/${SLUG}/notifications`, { method: "PATCH" })).status === 200);
const after = await (await http(`/api/biz/${SLUG}/notifications`)).json();
check("sau khi đọc, unread = 0", after.unread === 0, `unread=${after.unread}`);

// --- announcements (public) ---
const ann = await (await http("/api/announcements/active")).json();
check("GET /api/announcements/active → {items}", Array.isArray(ann.items));

// --- support ---
const sup = await (await http(`/api/biz/${SLUG}/support`)).json();
check("GET support → {threads}", Array.isArray(sup.threads));
const supUnread = await (await http(`/api/biz/${SLUG}/support/unread`)).json();
check("GET support/unread → số", typeof supUnread.unread === "number");

const created = await http(`/api/biz/${SLUG}/support`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ subject: "Kiểm tra gửi yêu cầu", message: "Nội dung kiểm thử tự động cho luồng hỗ trợ." }),
});
const thread = await created.json();
check("POST support → 201", created.status === 201 && Boolean(thread.id), `(status ${created.status})`);

const shortMsg = await http(`/api/biz/${SLUG}/support`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ subject: "Ngắn", message: "quá ngắn" }),
});
check("POST support nội dung ngắn → 400", shortMsg.status === 400);

const supAfter = await (await http(`/api/biz/${SLUG}/support`)).json();
check("thread mới có trong danh sách", supAfter.threads.some((t) => t.id === thread.id));

// trả lời trong thread + đánh dấu đã xử lý
const replied = await http(`/api/biz/${SLUG}/support/${thread.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ reply: "Mình gửi thêm thông tin nhé." }),
});
const repliedRow = await replied.json();
check("PATCH support/:id thêm trả lời", replied.status === 200 && repliedRow.message.includes("[Bạn]"));
check("trả lời xong thread quay về trạng thái new", repliedRow.status === "new");
const resolved = await http(`/api/biz/${SLUG}/support/${thread.id}`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ status: "resolved" }),
});
check("PATCH support/:id đổi trạng thái resolved", (await resolved.json()).status === "resolved");

// --- whitelists ---
const pageId = `page_verify_${Date.now()}`;
const wlAdd = await http(`/api/biz/${SLUG}/whitelists`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ page_id: pageId, page_name: "Page kiểm thử" }),
});
const wl = await wlAdd.json();
check("POST whitelists → 201", wlAdd.status === 201 && Boolean(wl.id));
const wlList = await (await http(`/api/biz/${SLUG}/whitelists`)).json();
check("GET whitelists có page vừa thêm", wlList.items.some((i) => i.page_id === pageId));
check("DELETE whitelists → 200", (await http(`/api/biz/${SLUG}/whitelists?page_id=${pageId}`, { method: "DELETE" })).status === 200);
const wlAfter = await (await http(`/api/biz/${SLUG}/whitelists`)).json();
check("sau xoá không còn page", !wlAfter.items.some((i) => i.page_id === pageId));

// --- mcp keys ---
const scopes = await (await http(`/api/biz/${SLUG}/mcp-keys/scopes`)).json();
check("GET mcp-keys/scopes có providers", Array.isArray(scopes.providers) && scopes.providers.length > 0);
const cat = await (await http(`/api/biz/${SLUG}/mcp-keys/field-catalog`)).json();
check("GET mcp-keys/field-catalog có entities", Array.isArray(cat.entities) && cat.entities.length > 0);
const status = await (await http(`/api/biz/${SLUG}/mcp-keys/access-status`)).json();
check("GET mcp-keys/access-status có total_keys", typeof status.total_keys === "number");
check("access-status có endpoint /mcp", status.endpoint === "/mcp");

// --- billing ---
const pricing = await (await http(`/api/biz/${SLUG}/billing/pricing`)).json();
check("GET billing/pricing có plans", Array.isArray(pricing.plans) && pricing.plans.length >= 4);
const pending = await (await http(`/api/biz/${SLUG}/billing/pending`)).json();
check("GET billing/pending có {items,total}", Array.isArray(pending.items) && typeof pending.total === "number");

// --- ai models ---
const ai = await (await http("/api/ai-models")).json();
check("GET /api/ai-models có providers", Array.isArray(ai.providers) && ai.providers.length >= 4);

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);

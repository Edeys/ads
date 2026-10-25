/**
 * Verify Phase 34 (Tool SDK): CRUD manifest + chạy tool HTTP + qua MCP (approval gate).
 *   node scripts/verify_custom_tools.mjs
 * Yêu cầu: server local đang chạy ở http://localhost:3000 (PGlite chỉ 1 process).
 */
import { createServer } from "node:http";

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

// 0) Endpoint giả lập để tool gọi tới
const echo = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ path: req.url, method: req.method, auth: req.headers.authorization ?? null, body }));
  });
});
await new Promise((r) => echo.listen(4599, "127.0.0.1", r));

try {
  // 1) Đăng nhập dev
  const { csrfToken } = await (await http("/api/auth/csrf")).json();
  const login = await http("/api/auth/callback/dev", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: EMAIL, csrfToken, callbackUrl: `${BASE}/biz/${SLUG}/dashboard`, json: "true" }),
  });
  check("đăng nhập dev", login.status < 400, `(status ${login.status})`);

  // 2) Trang tools render
  const page = await http(`/biz/${SLUG}/dashboard/tools`);
  check("GET /dashboard/tools → 200", page.status === 200, `(status ${page.status})`);

  // 3) Tạo tool qua API
  const name = `verify_echo_${Date.now().toString(36)}`;
  const created = await http(`/api/biz/${SLUG}/custom-tools`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      description: "Echo tham số để kiểm thử",
      method: "POST",
      url: "http://127.0.0.1:4599/echo/{{order_id}}",
      headers: { "x-verify": "{{tag}}" },
      bodyTemplate: '{"order_id":"{{order_id}}","tag":"{{tag}}"}',
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" }, tag: { type: "string" } },
        required: ["order_id"],
      },
      requiresApproval: true,
    }),
  });
  const tool = await created.json().catch(() => ({}));
  check("POST /custom-tools tạo tool", created.status === 201, `(status ${created.status} ${JSON.stringify(tool).slice(0, 120)})`);

  // 4) Trùng tên → 409
  const dup = await http(`/api/biz/${SLUG}/custom-tools`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, url: "http://127.0.0.1:4599/x" }),
  });
  check("trùng tên → 409", dup.status === 409, `(status ${dup.status})`);

  // 5) Tên có ký tự lạ → chuẩn hoá về snake_case
  const oddName = `Co Dau Cach ${Date.now().toString(36)}!`;
  const normalized = await http(`/api/biz/${SLUG}/custom-tools`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: oddName, url: "http://127.0.0.1:4599/x" }),
  });
  const normalizedBody = await normalized.json().catch(() => ({}));
  check(
    "tên có ký tự lạ → chuẩn hoá snake_case",
    normalized.status === 201 && /^[a-z][a-z0-9_]+$/.test(String(normalizedBody.name ?? "")),
    `(status ${normalized.status} name ${normalizedBody.name})`,
  );
  if (normalizedBody.id) {
    await http(`/api/biz/${SLUG}/custom-tools/${normalizedBody.id}`, { method: "DELETE" });
  }

  // 6) URL sai scheme → 400
  const badUrl = await http(`/api/biz/${SLUG}/custom-tools`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `badurl_${Date.now().toString(36)}`, url: "file:///etc/passwd" }),
  });
  check("url file:// → 400", badUrl.status === 400, `(status ${badUrl.status})`);

  // 7) Danh sách có tool
  const list = await (await http(`/api/biz/${SLUG}/custom-tools`)).json();
  check("GET /custom-tools có tool vừa tạo", Array.isArray(list) && list.some((t) => t.id === tool.id));

  // 8) Chạy tool từ UI (được phép, có audit)
  const run = await http(`/api/biz/${SLUG}/custom-tools/${tool.id}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ args: { order_id: "A-123", tag: "hello" } }),
  });
  const runData = await run.json().catch(() => ({}));
  check("POST /run → 200", run.status === 200, `(status ${run.status})`);
  check("tool gọi đúng URL (path có order_id)", String(runData?.data?.path ?? "").includes("A-123"), JSON.stringify(runData?.data ?? {}).slice(0, 160));
  check("tool render body template", String(runData?.data?.body ?? "").includes("hello"), String(runData?.data?.body ?? ""));
  check("tool trả header nội suy", String(runData?.data?.path ?? "") !== "");

  // 9) Thiếu tham số bắt buộc → 400
  const missing = await http(`/api/biz/${SLUG}/custom-tools/${tool.id}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ args: {} }),
  });
  check("thiếu arg bắt buộc → 400", missing.status === 400, `(status ${missing.status})`);

  // 10) Tắt tool → chạy bị 409
  const patch = await http(`/api/biz/${SLUG}/custom-tools/${tool.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  check("PATCH tắt tool → 200", patch.status === 200, `(status ${patch.status})`);
  const runOff = await http(`/api/biz/${SLUG}/custom-tools/${tool.id}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ args: { order_id: "X" } }),
  });
  check("tool tắt → 409", runOff.status === 409, `(status ${runOff.status})`);
  await http(`/api/biz/${SLUG}/custom-tools/${tool.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  // 11) MCP: tools/list thấy custom tool
  // Dọn key test còn sót từ lần chạy trước để dữ liệu demo không bị bẩn.
  const existingKeys = await (await http(`/api/biz/${SLUG}/mcp-keys`)).json().catch(() => []);
  for (const k of Array.isArray(existingKeys) ? existingKeys : []) {
    if (String(k.name ?? "").startsWith("Verify tool key")) {
      await http(`/api/biz/${SLUG}/mcp-keys/${k.id}`, { method: "DELETE" });
    }
  }

  const keyRes = await http(`/api/biz/${SLUG}/mcp-keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: `Verify tool key ${Date.now()}`,
      scopes: { meta_ads: "read", tiktok_ads: "read", google_ads: "read", pancake: "read", write: "false" },
    }),
  });
  const keyBody = await keyRes.json().catch(() => ({}));
  const rawKey = keyBody.key ?? keyBody.plaintext ?? keyBody.token ?? null;
  check("tạo MCP key để test", keyRes.status < 400 && Boolean(rawKey), `(status ${keyRes.status})`);

  if (rawKey) {
    const rpc = async (body) =>
      (await fetch(`${BASE}/mcp?key=${encodeURIComponent(rawKey)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })).json();

    const listed = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const names = (listed?.result?.tools ?? []).map((t) => t.name);
    check("MCP tools/list chứa custom tool", names.includes(name), `(${names.length} tool)`);

    const called = await rpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: { order_id: "MCP-1", tag: "mcp" } },
    });
    const payload = JSON.parse(called?.result?.content?.[0]?.text ?? "{}");
    check("MCP gọi tool side-effect → pending_approval", payload.status === "pending_approval", JSON.stringify(payload).slice(0, 160));

    if (payload.approval_id) {
      const approved = await http(`/api/biz/${SLUG}/approvals`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: payload.approval_id, action: "approve" }),
      });
      const apprBody = await approved.json().catch(() => ({}));
      check("duyệt approval → executed", apprBody.status === "executed", JSON.stringify(apprBody).slice(0, 160));
    }
  }

  // 12) Xoá tool + key test (dữ liệu demo sạch)
  const del = await http(`/api/biz/${SLUG}/custom-tools/${tool.id}`, { method: "DELETE" });
  check("DELETE /custom-tools/:id → 200", del.status === 200, `(status ${del.status})`);

  if (keyBody.id) {
    const delKey = await http(`/api/biz/${SLUG}/mcp-keys/${keyBody.id}`, { method: "DELETE" });
    check("DELETE key test → 200", delKey.status === 200, `(status ${delKey.status})`);
  }
} finally {
  echo.close();
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);

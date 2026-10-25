// Kiểm tra E2E lớp MCP sau khi server đã chạy.
//
//   node scripts/verify_mcp.mjs
//   MCP_KEY=mk_... node scripts/verify_mcp.mjs
//
// Không cần key: script vẫn kiểm tra được discovery + 401. Có key thì kiểm tra
// thêm initialize / tools/list / tools/call.
const base = (process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
const key = process.env.MCP_KEY || process.argv[2] || "";

let failed = 0;
function ok(label, extra = "") {
  console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ""}`);
}
function bad(label, extra = "") {
  failed++;
  console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ""}`);
}

async function get(path, init) {
  const res = await fetch(`${base}${path}`, init);
  let body = null;
  try {
    body = await res.clone().json();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { res, body };
}

async function rpc(id, method, params) {
  const res = await fetch(`${base}/mcp?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

console.log(`\nAdsSync MCP verify — ${base}\n`);

// 1) Discovery ---------------------------------------------------------------
console.log("Discovery");
{
  const { res, body } = await get("/.well-known/oauth-protected-resource");
  res.ok && body?.resource ? ok("protected-resource") : bad("protected-resource", `HTTP ${res.status}`);
}
{
  const { res, body } = await get("/.well-known/oauth-authorization-server");
  const endpoints = ["authorization_endpoint", "token_endpoint", "registration_endpoint"];
  const missing = endpoints.filter((k) => !body?.[k]);
  res.ok && missing.length === 0
    ? ok("authorization-server metadata", body.scopes_supported?.join(" "))
    : bad("authorization-server metadata", missing.join(", ") || `HTTP ${res.status}`);
}
{
  const { res } = await get("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const www = res.headers.get("www-authenticate") ?? "";
  res.status === 401 && www.includes("oauth-protected-resource")
    ? ok("401 có WWW-Authenticate trỏ discovery")
    : bad("401 + WWW-Authenticate", `HTTP ${res.status}`);
}
{
  const { res } = await get("/api/health");
  res.ok ? ok("health") : bad("health", `HTTP ${res.status}`);
}

// 2) MCP auth ---------------------------------------------------------------
if (!key) {
  console.log("\nBỏ qua kiểm tra key (đặt MCP_KEY=... để chạy đầy đủ).\n");
} else {
  console.log("\nMCP key");
  const init = await rpc(1, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "adsync-verify", version: "1.0.0" },
  });
  init.body?.result?.serverInfo
    ? ok("initialize", init.body.result.serverInfo.name)
    : bad("initialize", JSON.stringify(init.body).slice(0, 160));

  const list = await rpc(2, "tools/list", {});
  const tools = list.body?.result?.tools ?? [];
  tools.length > 0
    ? ok("tools/list", `${tools.length} tool`)
    : bad("tools/list", JSON.stringify(list.body).slice(0, 160));

  const expected = [
    "search_console_list_sites",
    "search_console_get_performance",
    "google_analytics_list_properties",
    "google_analytics_get_report",
    "clarity_get_live_insights",
  ];
  const names = new Set(tools.map((t) => t.name));
  const missing = expected.filter((t) => !names.has(t));
  missing.length === 0 ? ok("có tool GSC/GA4/Clarity") : bad("thiếu tool dữ liệu", missing.join(", "));

  const call = await rpc(3, "tools/call", { name: "adssync_list_connections", arguments: {} });
  const content = call.body?.result?.content?.[0]?.text ?? "";
  call.res.ok && !call.body?.error
    ? ok("tools/call adssync_list_connections", content.slice(0, 80))
    : bad("tools/call adssync_list_connections", JSON.stringify(call.body).slice(0, 160));
}

console.log(failed ? `\n${failed} mục lỗi.\n` : "\nTất cả kiểm tra đều đạt.\n");
process.exitCode = failed ? 1 : 0;

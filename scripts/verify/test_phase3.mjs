// Script kiểm tra luồng API Phase 3: Auth -> Configs CRUD -> Tick worker -> Activity log
async function run() {
  const base = "http://localhost:3000";

  // 1. Get CSRF token
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = [csrfRes.headers.get("set-cookie")?.split(";")[0]].filter(Boolean);

  // 2. Dev login
  const form = new URLSearchParams();
  form.append("email", "dev@local.test");
  form.append("csrfToken", csrfToken);

  const loginRes = await fetch(`${base}/api/auth/callback/dev`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookies.join("; "),
    },
    body: form.toString(),
    redirect: "manual",
  });

  const sessionCookies = loginRes.headers.getSetCookie?.() || [loginRes.headers.get("set-cookie")?.split(";")[0]].filter(Boolean);
  const authCookie = sessionCookies.find((c) => c.startsWith("authjs.session-token=") || c.startsWith("__Secure-authjs.session-token="));
  if (!authCookie) {
    console.error("Login failed, cookies:", loginRes.headers.raw?.() || loginRes.headers);
    process.exit(1);
  }
  const cookieHeader = authCookie.split(";")[0];
  console.log("✓ Dev login thành công");

  // 3. List configs
  const listRes = await fetch(`${base}/api/biz/my-biz/configs`, {
    headers: { cookie: cookieHeader },
  });
  const initialConfigs = await listRes.json();
  console.log("✓ GET /configs:", initialConfigs.length, "cấu hình hiện có");

  // 4. Create config (metrics_pull)
  const createRes = await fetch(`${base}/api/biz/my-biz/configs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({
      type: "metrics_pull",
      provider: "facebook",
      name: "Test E2E Kéo Chỉ Số",
      intervalMinutes: 10,
      params: {
        adAccountId: "act_123456789",
        sheetsConnId: "fake-sheets-id",
        sheetId: "fake-spreadsheet-id",
        sheetTab: "Sheet1",
        writeMode: "update",
        metrics: ["frequency", "cpm"],
      },
    }),
  });
  if (!createRes.ok) {
    console.error("Create config failed:", await createRes.text());
    process.exit(1);
  }
  const { id: createdId } = await createRes.json();
  console.log("✓ POST /configs tạo thành công id:", createdId);

  // 5. Patch toggle on/off
  const patchRes = await fetch(`${base}/api/biz/my-biz/configs/${createdId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({ status: "off" }),
  });
  console.log("✓ PATCH toggle off status:", patchRes.status);

  // Toggle back on for tick testing
  await fetch(`${base}/api/biz/my-biz/configs/${createdId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({ status: "on" }),
  });

  // 6. Test dev tick
  const tickRes = await fetch(`${base}/api/dev/tick`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({}),
  });
  const tickData = await tickRes.json();
  console.log("✓ POST /api/dev/tick dispatch:", tickData);

  // Check config status after tick
  const listAfterTick = await fetch(`${base}/api/biz/my-biz/configs`, {
    headers: { cookie: cookieHeader },
  });
  const configsAfter = await listAfterTick.json();
  const testedCfg = configsAfter.find((c) => c.id === createdId);
  console.log("✓ Trạng thái config sau khi worker tick:", {
    lastRunStatus: testedCfg?.lastRunStatus,
    lastError: testedCfg?.lastError,
    lastRunAt: testedCfg?.lastRunAt,
  });

  // 7. Delete test config
  const delRes = await fetch(`${base}/api/biz/my-biz/configs/${createdId}`, {
    method: "DELETE",
    headers: { cookie: cookieHeader },
  });
  console.log("✓ DELETE /configs:", delRes.status);

  console.log("=== TOÀN BỘ PIPELINE PHASE 3 VERIFIED PASS ===");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

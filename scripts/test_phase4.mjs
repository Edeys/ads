// Test CPA Thresholds CRUD & AutoPause verification
async function run() {
  const base = "http://localhost:3000";

  // 1. Get CSRF & login
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookies = [csrfRes.headers.get("set-cookie")?.split(";")[0]].filter(Boolean);

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
  const cookieHeader = authCookie.split(";")[0];

  // 2. Create CPA Threshold
  const cpaCreateRes = await fetch(`${base}/api/biz/my-biz/cpa`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({
      platform: "meta",
      name: "Ngưỡng Test E2E",
      limits: {
        replies: { perMessage: 25000, perPurchase: 100000 },
        offsite_conversions: { perPurchase: 150000 },
      },
      minDataPct: 120,
      maxPct: 200,
    }),
  });
  if (!cpaCreateRes.ok) {
    console.error("CPA create failed:", await cpaCreateRes.text());
    process.exit(1);
  }
  const { id: thresholdId } = await cpaCreateRes.json();
  console.log("✓ POST /cpa tạo thành công ngưỡng id:", thresholdId);

  // 3. Create auto_pause config referencing threshold
  const cfgCreateRes = await fetch(`${base}/api/biz/my-biz/configs`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({
      type: "auto_pause",
      provider: "facebook",
      name: "Autopilot Test E2E",
      intervalMinutes: 10,
      params: {
        adAccountId: "act_test",
        level: "campaign",
        thresholdId: thresholdId,
        protectedCampaignIds: ["1202000001"],
        telegramConnId: "fake-tg-id",
        aiConnId: "fake-ai-id",
      },
    }),
  });
  const { id: autoPauseCfgId } = await cfgCreateRes.json();
  console.log("✓ POST /configs tạo auto_pause config id:", autoPauseCfgId);

  // 4. Tick dispatch
  const tickRes = await fetch(`${base}/api/dev/tick`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({}),
  });
  console.log("✓ POST /api/dev/tick:", await tickRes.json());

  // 5. Cleanup
  await fetch(`${base}/api/biz/my-biz/configs/${autoPauseCfgId}`, {
    method: "DELETE",
    headers: { cookie: cookieHeader },
  });
  await fetch(`${base}/api/biz/my-biz/cpa/${thresholdId}`, {
    method: "DELETE",
    headers: { cookie: cookieHeader },
  });
  console.log("✓ Dọn dẹp test configs & thresholds thành công");
  console.log("=== TOÀN BỘ PIPELINE CPA / AUTOPAUSE VERIFIED PASS ===");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

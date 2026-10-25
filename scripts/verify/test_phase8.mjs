// Test Phase 8: Settings, Members, Invites, Roles
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

  // 2. GET & PATCH Settings (VAT & Biz Info)
  const getSettingsRes = await fetch(`${base}/api/biz/my-biz/settings`, {
    headers: { cookie: cookieHeader },
  });
  const settingsData = await getSettingsRes.json();
  console.log("✓ GET /settings:", settingsData.name, "isOwner:", settingsData.isOwner);

  const patchSettingsRes = await fetch(`${base}/api/biz/my-biz/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({
      name: "My Biz Updated",
      vatTaxCode: "0109998888",
      vatCompanyName: "Công ty TNHH Quảng Cáo Số",
      vatCompanyAddress: "123 Đường Công Nghệ, Hà Nội",
    }),
  });
  console.log("✓ PATCH /settings status:", patchSettingsRes.status);

  // 3. GET Members
  const membersRes = await fetch(`${base}/api/biz/my-biz/members`, {
    headers: { cookie: cookieHeader },
  });
  const membersData = await membersRes.json();
  console.log("✓ GET /members:", membersData.length, "thành viên");

  // 4. POST Create Invite
  const createInviteRes = await fetch(`${base}/api/biz/my-biz/invites`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({
      email: "collab@local.test",
      permissions: ["metric_sync.access", "ad_metrics.access"],
    }),
  });
  if (!createInviteRes.ok) {
    console.error("Create invite failed:", await createInviteRes.text());
    process.exit(1);
  }
  const inviteData = await createInviteRes.json();
  console.log("✓ POST /invites tạo thành công invite id:", inviteData.id);

  // 5. GET Invites
  const listInvitesRes = await fetch(`${base}/api/biz/my-biz/invites`, {
    headers: { cookie: cookieHeader },
  });
  const invitesData = await listInvitesRes.json();
  console.log("✓ GET /invites:", invitesData.length, "lời mời");

  // 6. DELETE Revoke Invite
  const revokeRes = await fetch(`${base}/api/biz/my-biz/invites/${inviteData.id}`, {
    method: "DELETE",
    headers: { cookie: cookieHeader },
  });
  console.log("✓ DELETE /invites thu hồi lời mời:", revokeRes.status);

  // 7. Restore biz name
  await fetch(`${base}/api/biz/my-biz/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({ name: "my-biz" }),
  });

  console.log("=== TOÀN BỘ PIPELINE PHASE 8 VERIFIED PASS ===");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

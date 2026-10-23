/**
 * In danh sách link trong sidebar (kiểm tra nav có đủ mục như Done.vn không).
 *   node scripts/check_nav.mjs
 */
const BASE = process.env.LOCAL_BASE ?? "http://localhost:3000";
const SLUG = process.env.LOCAL_SLUG ?? "my-biz";

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

const { csrfToken } = await (await http("/api/auth/csrf")).json();
await http("/api/auth/callback/dev", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ email: "dev@local.test", csrfToken, callbackUrl: `${BASE}/biz/${SLUG}/dashboard`, json: "true" }),
});

const html = await (await http(`/biz/${SLUG}/dashboard/huong-dan`)).text();
const aside = html.split("<aside")[1]?.split("</aside>")[0] ?? "";
const labels = [...aside.matchAll(/<span class="truncate">([^<]+)<\/span>/g)].map((m) => m[1]);
const plain = [...aside.matchAll(/title="([^"]+)"/g)].map((m) => m[1]);
console.log("span.truncate:", labels.join(" | "));
console.log("title:", plain.join(" | "));
console.log("có Hướng dẫn:", aside.includes("Hướng dẫn"));

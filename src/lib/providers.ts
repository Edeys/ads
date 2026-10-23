// Server-only: health checks + build connection row từ form.
// Catalog data tách sang provider-catalog.ts (client-safe).
import { createSign } from "crypto";
import { fetchT } from "./http";
import { decryptSecret, encryptSecret } from "./crypto";
import { grantedKeys, missingScopes } from "./oauth-scopes";
import type { ProviderDef } from "./provider-catalog";

export * from "./provider-catalog";

export function readSecret(enc: string): Record<string, string> {
  return decryptSecret(enc);
}

export function buildSecretAndMeta(provider: ProviderDef, values: Record<string, string>) {
  const secret: Record<string, string> = {};
  const meta: Record<string, unknown> = {};
  for (const f of provider.fields) {
    const val = String(values[f.key] ?? "").trim();
    if (f.required && !val) {
      throw new Error(`Thiếu trường bắt buộc: ${f.label}`);
    }
    if (f.secret) {
      secret[f.key] = val;
    } else {
      meta[f.key] = val;
    }
  }
  return {
    secret,
    encSecret: encryptSecret(secret),
    meta,
  };
}

// ---------- Health checks ----------
// Trả về health mới + meta merge (vd Meta kéo ad accounts/pages về).
export async function checkHealth(conn: { provider: string; secret: Record<string, string>; meta: Record<string, unknown> }) {
  const s = conn.secret ?? {};
  const check = CHECKS[conn.provider];
  if (!check) return { health: "unchecked" as const };
  try {
    return await check(s, conn.meta ?? {});
  } catch {
    return { health: "dead" as const };
  }
}

type CheckResult = { health: "ok" | "dead" | "unchecked"; meta?: Record<string, unknown> };
type CheckFn = (secret: Record<string, string>, meta: Record<string, unknown>) => Promise<CheckResult>;

const okIf = async (res: Response, extra?: () => Promise<Record<string, unknown>>): Promise<CheckResult> => {
  if (!res.ok) return { health: "dead" };
  return { health: "ok", meta: extra ? await extra() : undefined };
};

const CHECKS: Record<string, CheckFn> = {
  async meta_ads(s, meta) {
    if (s.access_token?.startsWith("mock_")) return { health: "ok", meta };
    const token = s.access_token;
    const GRAPH = "https://graph.facebook.com/v21.0";

    // Scope đã cấp: /debug_token trả về danh sách quyền thực tế của token.
    const debug = await fetchT(`${GRAPH}/debug_token?input_token=${token}&access_token=${token}`)
      .then((r) => r.json())
      .catch(() => ({}));
    const grantedScopeRaw = String(debug.data?.scopes ?? "");
    const granted = grantedKeys("meta", grantedScopeRaw);
    const missing = missingScopes("meta", granted);
    // expires_at = 0 nghĩa là token không hết hạn (app token / token dài hạn đặc biệt).
    const expiresAtSeconds = Number(debug.data?.expires_at ?? 0);
    const tokenExpiresAt = expiresAtSeconds > 0 ? new Date(expiresAtSeconds * 1000).toISOString() : null;

    // /me chỉ cần user_id — dùng để kiểm tra token còn sống.
    const me = await fetchT(`${GRAPH}/me?fields=id,name&access_token=${token}`).then((r) => r.json()).catch(() => ({}));
    if (me.error) return { health: "dead" };

    // Ad accounts: /me/adaccounts chỉ trả account của profile đang đăng nhập.
    // Với token có business_management, đọc qua /me/businesses để lấy đủ
    // account thuộc business (trường hợp phổ biến với khách hàng agency).
    const direct = await fetchT(
      `${GRAPH}/me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=200&access_token=${token}`
    ).then((r) => r.json()).catch(() => ({}));

    const bizRes = await fetchT(`${GRAPH}/me/businesses?fields=id,name&limit=100&access_token=${token}`)
      .then((r) => r.json()).catch(() => ({}));
    const businessIds: string[] = (bizRes.data ?? []).map((b: any) => b.id);

    const bizAccounts: any[] = [];
    for (const bid of businessIds.slice(0, 25)) {
      const r = await fetchT(
        `${GRAPH}/${bid}/owned_adaccounts?fields=id,name,account_status,currency,timezone_name&limit=200&access_token=${token}`
      ).then((x) => x.json()).catch(() => ({}));
      for (const a of r.data ?? []) bizAccounts.push({ ...a, businessId: bid });
    }

    const seen = new Set<string>();
    const adAccounts = [...(direct.data ?? []), ...bizAccounts]
      .filter((a: any) => a?.id && !seen.has(a.id) && seen.add(a.id))
      .map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.account_status,
        currency: a.currency,
        timezone: a.timezone_name,
        businessId: a.businessId ?? null,
      }));

    const [pagesRes, igRes, pixelsRes] = await Promise.all([
      fetchT(`${GRAPH}/me/accounts?fields=id,name,access_token,category,link&limit=200&access_token=${token}`).then((r) => r.json()).catch(() => ({})),
      fetchT(`${GRAPH}/me/accounts?fields=instagram_business_account{id,username,name}&limit=200&access_token=${token}`).then((r) => r.json()).catch(() => ({})),
      fetchT(`${GRAPH}/me/adpixels?fields=id,name,pixel_id&limit=100&access_token=${token}`).then((r) => r.json()).catch(() => ({})),
    ]);

    const pages = (pagesRes.data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category ?? null,
      link: p.link ?? null,
      hasInstagram: Boolean(p.instagram_business_account),
      instagram: p.instagram_business_account
        ? {
            id: p.instagram_business_account.id,
            username: p.instagram_business_account.username,
            name: p.instagram_business_account.name,
          }
        : null,
    }));

    const pixels = (pixelsRes.data ?? []).map((p: any) => ({
      id: p.id,
      pixelId: p.pixel_id ?? p.id,
      name: p.name,
    }));

    return {
      health: "ok",
      meta: {
        ...meta,
        adAccounts,
        pages,
        pixels,
        businesses: (bizRes.data ?? []).map((b: any) => ({ id: b.id, name: b.name })),
        grantedScopes: granted,
        missingScopes: missing.map((m) => m.key),
        scopeRaw: grantedScopeRaw,
        tokenExpiresAt,
        profile: { id: me.id, name: me.name },
      },
    };
  },

  async tiktok_ads(s, meta) {
    if (s.access_token?.startsWith("mock_")) return { health: "ok", meta };
    const res = await fetchT("https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/", {
      headers: { "Access-Token": s.access_token },
    });
    const j = await res.json().catch(() => ({}));
    return res.ok && j.code === 0 ? { health: "ok", meta: { advertisers: j.data?.list ?? [] } } : { health: "dead" };
  },

  async google_ads(s, meta) {
    if (s.access_token?.startsWith("mock_")) return { health: "ok", meta };
    if (s.access_token) {
      const res = await fetchT("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${s.access_token}` },
      });
      return res.ok ? { health: "ok", meta } : { health: "dead" };
    }
    return { health: "ok", meta };
  },

  async google_search_console(s, meta) {
    if (s.access_token?.startsWith("mock_")) return { health: "ok", meta };
    const token = await googleRefreshToken(s);
    if (!token) return { health: "dead" };
    const res = await fetchT("https://searchconsole.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { health: "dead" };
    const j = await res.json().catch(() => ({}));
    const sites = (j.siteEntry ?? []).map((x: any) => x.siteUrl);
    return { health: "ok", meta: { ...meta, sites } };
  },

  async ga4(s, meta) {
    if (s.access_token?.startsWith("mock_")) return { health: "ok", meta };
    const token = await googleRefreshToken(s);
    if (!token) return { health: "dead" };
    const res = await fetchT("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { health: "dead" };
    const j = await res.json().catch(() => ({}));
    const properties: Array<{ propertyId: string; property: string }> = [];
    for (const acc of j.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) {
        properties.push({
          propertyId: String(p.property ?? "").replace("properties/", ""),
          property: p.displayName ?? "",
        });
      }
    }
    return { health: "ok", meta: { ...meta, properties } };
  },

  async clarity(s, meta) {
    if (s.api_token?.startsWith("mock_")) return { health: "ok", meta };
    const res = await fetchT("https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1", {
      headers: { Authorization: `Bearer ${s.api_token}`, "content-type": "application/json" },
    });
    // 429 = token đúng nhưng hết quota ngày; vẫn coi là kết nối sống.
    if (res.status === 429) return { health: "ok", meta: { ...meta, quota: "exhausted" } };
    return res.ok ? { health: "ok", meta } : { health: "dead" };
  },

  async gemini(s) {
    return okIf(await fetchT(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${s.api_key}`));
  },
  async openai(s) {
    return okIf(await fetchT("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${s.api_key}` } }));
  },
  async anthropic(s) {
    return okIf(await fetchT("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": s.api_key, "anthropic-version": "2023-06-01" },
    }));
  },
  async deepseek(s) {
    return okIf(await fetchT("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${s.api_key}` } }));
  },
  async openai_compatible(s, meta) {
    const base = String(meta.base_url ?? "").replace(/\/$/, "");
    if (!base) return { health: "dead" };
    return okIf(await fetchT(`${base}/models`, { headers: { Authorization: `Bearer ${s.api_key}` } }));
  },

  async telegram(s) {
    const res = await fetchT(`https://api.telegram.org/bot${s.bot_token}/getMe`);
    if (!res.ok) return { health: "dead" };
    const j = await res.json();
    return { health: "ok", meta: { bot_username: j.result?.username } };
  },

  async google_sheets(s) {
    const sa = JSON.parse(s.service_account_json ?? "{}");
    if (!sa.client_email || !sa.private_key) return { health: "dead" };
    const token = await googleServiceAccountToken(sa, "https://www.googleapis.com/auth/spreadsheets.readonly");
    return token ? { health: "ok" } : { health: "dead" };
  },

  async pancake_pos(s) { return pancakeCheck(s); },
  async pancake_crm(s) { return pancakeCheck(s); },
  async pancake_chat(s) { return pancakeCheck(s); },
};

// Đổi refresh_token -> access_token cho các connector Google đọc dữ liệu.
async function googleRefreshToken(s: Record<string, string>): Promise<string | null> {
  if (s.access_token && !s.refresh_token) return s.access_token;
  const clientId = s.client_id || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID || "";
  const clientSecret = s.client_secret || process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET || "";
  if (!s.refresh_token || !clientId || !clientSecret) return s.access_token ?? null;
  const res = await fetchT("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: s.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return (j.access_token as string) ?? null;
}

async function pancakeCheck(s: Record<string, string>): Promise<CheckResult> {  const res = await fetchT(`https://pos.pancake.vn/api/v1/shops?access_token=${s.access_token}&page_size=1`);
  if (!res.ok) return { health: "dead" };
  const j = await res.json().catch(() => ({}));
  return j.success === false ? { health: "dead" } : { health: "ok" };
}

// Service account -> OAuth access token (RS256 JWT grant, không cần thư viện)
export async function googleServiceAccountToken(sa: { client_email: string; private_key: string }, scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  const sig = sign.sign(sa.private_key, "base64url");
  const jwt = `${unsigned}.${sig}`;

  const res = await fetchT("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.access_token as string;
}

// OAuth cho các mạng social mới (X, LinkedIn, TikTok, Threads, Pinterest).
//
// Mỗi mạng khai báo trong SOCIAL_NETWORKS: URL authorize/token, scope, env
// chứa client id/secret. Anh chỉ cần đăng ký app (docs/ADAPTERS.md), điền env
// hoặc nhập qua Cài đặt → các route /api/connect/social/[network]/* chạy ngay.
// State ký HMAC như luồng Meta sẵn có; callback đổi code → lưu connection.
import { createHash, createHmac, randomBytes } from "crypto";

export type SocialNetworkDef = {
  key: string; // path param + provider id
  label: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce?: boolean;
  // Env đọc client id/secret — lấy biến đầu tiên khác rỗng.
  clientIdEnv: string[];
  clientSecretEnv: string[];
  extraAuthParams?: Record<string, string>;
  // Lấy access_token từ response đổi code (mỗi mạng đặt tên khác nhau).
  pickTokens: (j: any) => { access_token: string; refresh_token?: string; expires_in?: number };
  // Sau khi có token, dò danh tính để hiện connection tên có nghĩa.
  resolveIdentity: (token: string) => Promise<{ refId: string | null; name: string }>;
};

async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 200) }; }
}

export const SOCIAL_NETWORKS: Record<string, SocialNetworkDef> = {
  x_twitter: {
    key: "x_twitter", label: "X (Twitter)",
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    pkce: true,
    clientIdEnv: ["X_CLIENT_ID"],
    clientSecretEnv: ["X_CLIENT_SECRET"],
    extraAuthParams: { code_challenge_method: "S256" },
    pickTokens: (j) => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in }),
    resolveIdentity: async (token) => {
      const me = await json("https://api.twitter.com/2/users/me", { headers: { authorization: `Bearer ${token}` } });
      return { refId: me?.data?.id ?? null, name: me?.data?.username ? `@${me.data.username}` : "X" };
    },
  },
  linkedin: {
    key: "linkedin", label: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "w_member_social"],
    clientIdEnv: ["LINKEDIN_CLIENT_ID"],
    clientSecretEnv: ["LINKEDIN_CLIENT_SECRET"],
    pickTokens: (j) => ({ access_token: j.access_token, expires_in: j.expires_in }),
    resolveIdentity: async (token) => {
      const me = await json("https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${token}` } });
      return { refId: me?.sub ? `urn:li:person:${me.sub}` : null, name: me?.name ?? "LinkedIn" };
    },
  },
  tiktok: {
    key: "tiktok", label: "TikTok (đăng bài)",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.publish"],
    clientIdEnv: ["TIKTOK_APP_ID"],
    clientSecretEnv: ["TIKTOK_APP_SECRET"],
    pickTokens: (j) => ({ access_token: j.data?.access_token ?? j.access_token, refresh_token: j.data?.refresh_token ?? j.refresh_token, expires_in: j.data?.expires_in ?? j.expires_in }),
    resolveIdentity: async (token) => {
      const me = await json("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: { authorization: `Bearer ${token}` } });
      return { refId: me?.data?.user?.open_id ?? null, name: me?.data?.user?.display_name ?? "TikTok" };
    },
  },
  threads: {
    key: "threads", label: "Threads",
    authUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: ["threads_basic", "threads_content_publish"],
    clientIdEnv: ["THREADS_CLIENT_ID", "META_APP_ID"],
    clientSecretEnv: ["THREADS_CLIENT_SECRET", "META_APP_SECRET"],
    pickTokens: (j) => ({ access_token: j.access_token, expires_in: j.expires_in }),
    resolveIdentity: async (token) => {
      const me = await json("https://graph.threads.net/v1.0/me?fields=id,username", { headers: { authorization: `Bearer ${token}` } });
      return { refId: me?.id ?? null, name: me?.username ? `@${me.username}` : "Threads" };
    },
  },
  pinterest: {
    key: "pinterest", label: "Pinterest",
    authUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: ["boards:read", "pins:write", "user_accounts:read"],
    clientIdEnv: ["PINTEREST_CLIENT_ID"],
    clientSecretEnv: ["PINTEREST_CLIENT_SECRET"],
    pickTokens: (j) => ({ access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in }),
    resolveIdentity: async (token) => {
      const me = await json("https://api.pinterest.com/v5/user_account", { headers: { authorization: `Bearer ${token}` } });
      return { refId: null, name: me?.username ? `Pinterest · ${me.username}` : "Pinterest" };
    },
  },
};

export function socialClient(def: SocialNetworkDef) {
  const clientId = def.clientIdEnv.map((k) => process.env[k]).find(Boolean);
  const clientSecret = def.clientSecretEnv.map((k) => process.env[k]).find(Boolean);
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function signSocialState(payload: object) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev-secret").update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySocialState(state: string): { slug: string; network: string; verifier?: string } | null {
  const [data, sig] = (state ?? "").split(".");
  if (!data || !sig) return null;
  const expect = createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev-secret").update(data).digest("base64url");
  if (sig !== expect) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString());
    if (!p?.ts || Date.now() - Number(p.ts) > 15 * 60_000) return null;
    return p;
  } catch { return null; }
}

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  // PKCE: challenge = BASE64URL(SHA-256(verifier)) — chuẩn RFC 7636, không phải HMAC.
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function exchangeSocialCode(
  def: SocialNetworkDef,
  client: { clientId: string; clientSecret: string },
  code: string,
  redirectUri: string,
  verifier?: string,
) {
  const body = new URLSearchParams({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (def.pkce && verifier) {
    body.set("code_verifier", verifier);
    body.delete("client_secret"); // X PKCE public client không gửi secret trong body
  }
  const j = await json(def.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  return def.pickTokens(j);
}

export { json as socialJson };

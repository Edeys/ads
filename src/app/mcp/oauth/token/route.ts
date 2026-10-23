// OAuth 2.1 token endpoint cho MCP.
import { exchangeCode, refreshAccessToken, verifyClientSecret } from "@/lib/mcp-oauth";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function basicAuth(req: Request): { clientId: string; clientSecret: string } | null {
  const h = req.headers.get("authorization");
  if (!h || !h.toLowerCase().startsWith("basic ")) return null;
  try {
    const raw = Buffer.from(h.slice(6).trim(), "base64").toString("utf8");
    const idx = raw.indexOf(":");
    if (idx < 0) return null;
    return {
      clientId: decodeURIComponent(raw.slice(0, idx)),
      clientSecret: decodeURIComponent(raw.slice(idx + 1)),
    };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "oauth_token"), 120, 5 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  let body: any = {};
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("application/json")) body = await req.json();
    else {
      const form = await req.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch {
    body = {};
  }

  const basic = basicAuth(req);
  const clientId = String(body.client_id ?? basic?.clientId ?? "");
  const clientSecret = String(body.client_secret ?? basic?.clientSecret ?? "");

  if (!clientId || !clientSecret) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }
  if (!(await verifyClientSecret(clientId, clientSecret))) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }

  const grantType = String(body.grant_type ?? "authorization_code");

  if (grantType === "authorization_code") {
    const res = await exchangeCode({
      code: String(body.code ?? ""),
      clientId,
      redirectUri: String(body.redirect_uri ?? ""),
      codeVerifier: body.code_verifier ? String(body.code_verifier) : null,
    });
    if ("error" in res) {
      return Response.json({ error: res.error }, { status: 400 });
    }
    return Response.json({
      access_token: res.accessToken,
      token_type: "Bearer",
      expires_in: res.expiresIn,
      refresh_token: res.refreshToken,
      scope: res.scope,
    });
  }

  if (grantType === "refresh_token") {
    const res = await refreshAccessToken({
      refreshToken: String(body.refresh_token ?? ""),
      clientId,
    });
    if ("error" in res) {
      return Response.json({ error: res.error }, { status: 400 });
    }
    return Response.json({
      access_token: res.accessToken,
      token_type: "Bearer",
      expires_in: res.expiresIn,
      scope: res.scope,
    });
  }

  return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
}

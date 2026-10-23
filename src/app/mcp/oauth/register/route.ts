// Dynamic Client Registration (DCR) — ChatGPT và MCP client khác tự đăng ký.
import { registerClient } from "@/lib/mcp-oauth";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "dcr"), 30, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* body rỗng -> dùng mặc định */
  }

  const rawUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  const redirectUris = rawUris.filter((u) => {
    try {
      const parsed = new URL(u);
      // OAuth 2.1 yêu cầu https, trừ loopback trên http.
      if (parsed.protocol === "https:") return true;
      return parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    } catch {
      return false;
    }
  });

  if (!redirectUris.length) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: "Cần ít nhất một redirect_uri hợp lệ (https hoặc http://localhost)." },
      { status: 400 },
    );
  }

  const client = await registerClient({
    clientName: body.client_name ? String(body.client_name) : null,
    redirectUris,
  });

  return Response.json({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    client_id_issued_at: client.clientIdIssuedAt,
    token_endpoint_auth_method: "client_secret_post",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "mcp:read mcp:write",
    redirect_uris: redirectUris,
  }, { status: 201 });
}

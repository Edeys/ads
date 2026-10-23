// Protected resource metadata — file này trỏ MCP client tới authorization server.
// Theo MCP spec, client đọc <resource>/.well-known/oauth-protected-resource trước
// khi bắt đầu luồng OAuth.
import { OAUTH_TOKEN_TTL_MS } from "@/lib/mcp-oauth";
import { currentAppUrl } from "@/lib/self-hosted-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = currentAppUrl().replace(/\/$/, "");
  return Response.json({
    resource: origin,
    authorization_servers: [origin],
    scopes_supported: ["mcp:read", "mcp:write"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${origin}/biz`,
    access_token_ttl: OAUTH_TOKEN_TTL_MS / 1000,
  });
}

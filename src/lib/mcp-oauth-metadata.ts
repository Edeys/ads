// Metadata OAuth 2.1 dùng chung cho mọi đường discovery.
//
// MCP client (ChatGPT, Claude, Cursor) dò theo thứ tự:
//   1. 401 từ /mcp → đọc /.well-known/oauth-protected-resource
//   2. protected-resource trả authorization_servers: [origin]
//   3. client đọc /.well-known/oauth-authorization-server (RFC 8414)
// Trước đây chỉ có /mcp/oauth/metadata nên bước 3 trả 404 và luồng OAuth dừng.
import { OAUTH_CODE_TTL_MS, OAUTH_TOKEN_TTL_MS } from "@/lib/mcp-oauth";
import { currentAppUrl } from "@/lib/self-hosted-config";

export function authorizationServerMetadata() {
  const origin = currentAppUrl().replace(/\/$/, "");
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/oauth/authorize`,
    token_endpoint: `${origin}/mcp/oauth/token`,
    registration_endpoint: `${origin}/mcp/oauth/register`,
    scopes_supported: ["mcp:read", "mcp:write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    authorization_details_types_supported: ["oauth_metadata"],
    service_documentation: `${origin}/biz`,
    instructions:
      "Dung mcp:read de xem chi so va tai khoan. mcp:write cho phep tao yeu cau thay doi, " +
      "nhung moi lenh ghi van phai duoc chu Biz duyet trong ung dung AdsSync.",
    code_challenge_ttl: OAUTH_CODE_TTL_MS / 1000,
    access_token_ttl: OAUTH_TOKEN_TTL_MS / 1000,
  };
}

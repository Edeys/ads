// OAuth 2.1 metadata discovery — ChatGPT (và MCP client khác) đọc file này
// để biết endpoint đăng ký, cấp quyền, lấy token và các tính năng hỗ trợ.
import { OAUTH_CODE_TTL_MS, OAUTH_TOKEN_TTL_MS } from "@/lib/mcp-oauth";
import { currentAppUrl } from "@/lib/self-hosted-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Dùng APP_URL chứ không dùng req.url: Next chuẩn hoá "127.0.0.1" thành
  // "localhost", còn redirect URI đã đăng ký ở Meta/Google dùng 127.0.0.1.
  // Endpoint OAuth phải trỏ đúng origin mà client có thể gọi tới.
  const origin = currentAppUrl().replace(/\/$/, "");

  return Response.json({
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/oauth/authorize`,
    token_endpoint: `${origin}/mcp/oauth/token`,
    registration_endpoint: `${origin}/mcp/oauth/register`,
    scopes_supported: ["mcp:read", "mcp:write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    authorization_details_types_supported: ["oauth_metadata"],
    // ChatGPT đọc các trường này để biết server hỗ trợ gì.
    service_documentation: `${origin}/biz`,
    instructions:
      "Dung mcp:read de xem chi so va tai khoan. mcp:write cho phep tao yeu cau thay doi, " +
      "nhung moi lenh ghi van phai duoc chu Biz duyet trung ung dung AdsSync.",
    code_challenge_ttl: OAUTH_CODE_TTL_MS / 1000,
    access_token_ttl: OAUTH_TOKEN_TTL_MS / 1000,
  });
}

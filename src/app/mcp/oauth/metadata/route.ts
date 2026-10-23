// Metadata OAuth 2.1 — giữ đường dẫn cũ cho client đã cấu hình.
// Nội dung lấy từ builder chung (cùng nguồn với /.well-known/oauth-authorization-server).
import { authorizationServerMetadata } from "@/lib/mcp-oauth-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(authorizationServerMetadata());
}

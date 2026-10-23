// RFC 8414 — metadata authorization server tại gốc domain.
// Đây là đường discovery chuẩn mà ChatGPT/Claude/Cursor gọi sau khi đọc
// /.well-known/oauth-protected-resource.
import { authorizationServerMetadata } from "@/lib/mcp-oauth-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(authorizationServerMetadata());
}

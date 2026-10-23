// Alias discovery kiểu OpenID — một số MCP client dò đường này trước.
import { authorizationServerMetadata } from "@/lib/mcp-oauth-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(authorizationServerMetadata());
}

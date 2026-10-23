// MCP endpoint — JSON-RPC stateless qua POST /mcp
//
// Hai cách xác thực:
//   1. API key:  POST /mcp?key=mk_...   (Claude Desktop, Cursor, scripts)
//   2. OAuth:    POST /mcp  + header "Authorization: Bearer <access_token>"
//                (ChatGPT, MCP client chuẩn OAuth 2.1)
//
// Cả hai đều dùng chung lớp tool, quyền, bộ chỉ số và Approval Gate.
import { resolveKey, listTools, callTool, keyInstructions } from "@/mcp/server";
import { resolveAccessToken } from "@/lib/mcp-oauth";
import { currentAppUrl } from "@/lib/self-hosted-config";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const PROTOCOL_VERSION = "2025-03-26";

function rpcOk(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcErr(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handle(key: any, msg: any) {
  if (!msg || msg.jsonrpc !== "2.0") return rpcErr(msg?.id, -32600, "Invalid Request");
  const { id, method, params } = msg;

  if (method === "initialize") {
    return rpcOk(id, {
      protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "AdsSync Local", version: "0.1.0" },
      instructions: await keyInstructions(key),
    });
  }
  if (method === "ping") return rpcOk(id, {});
  if (method === "tools/list") return rpcOk(id, { tools: await listTools(key) });
  if (method === "tools/call") {
    try {
      const result = await callTool(key, params?.name, params?.arguments ?? {});
      return rpcOk(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (e: any) {
      return rpcOk(id, { content: [{ type: "text", text: `Lỗi: ${e.message}` }], isError: true });
    }
  }
  // notifications → không trả result (theo spec server trả 202, nhưng stateless trả null được)
  if (typeof method === "string" && method.startsWith("notifications/")) return null;
  return rpcErr(id, -32601, `Method not found: ${method}`);
}

/** Lấy key từ query string, header x-mcp-key hoặc bearer token OAuth. */
async function resolveAnyKey(req: Request, url: URL) {
  const apiKey = url.searchParams.get("key") || req.headers.get("x-mcp-key") || null;
  if (apiKey) {
    const key = await resolveKey(apiKey);
    if (key) return key;
  }

  const auth = req.headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) {
    const token = auth.replace(/^bearer\s+/i, "").trim();
    const resolved = await resolveAccessToken(token);
    if (resolved) return resolved.key;
  }
  return null;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const key = await resolveAnyKey(req, url);
  if (!key) {
    // Client chuẩn OAuth cần header này để biết đi đâu để xin quyền.
    // Header chỉ nhận ByteString nên mọi ký tự phải là ASCII.
    const resource = currentAppUrl().replace(/\/$/, "");
    return Response.json(
      rpcErr(null, -32001, "invalid_key"),
      {
        status: 401,
        headers: {
          "WWW-Authenticate":
            `Bearer realm="adsync", resource_metadata="${resource}/.well-known/oauth-protected-resource", ` +
            `error="invalid_token", error_description="Missing API key or OAuth access token."`,
        },
      },
    );
  }

  let body: any;
  try { body = await req.json(); } catch { return Response.json(rpcErr(null, -32700, "Parse error"), { status: 400 }); }

  // Giới hạn theo từng key: agent chạy vòng lặp lỗi không được đốt API provider.
  // Mặc định 240 request/phút cho mỗi key, chỉnh bằng MCP_RATE_LIMIT_PER_MIN.
  const max = Number(process.env.MCP_RATE_LIMIT_PER_MIN ?? 240);
  const rl = rateLimit(`mcp:${key.id}`, Number.isFinite(max) && max > 0 ? max : 240, 60_000);
  if (!rl.ok) {
    return Response.json(rpcErr(body?.id, -32000, `rate_limited: thử lại sau ${rl.retryAfter}s`), {
      status: 429,
      headers: { "retry-after": String(rl.retryAfter) },
    });
  }

  if (Array.isArray(body)) {
    const results = (await Promise.all(body.map((m) => handle(key, m)))).filter((r) => r !== null);
    return Response.json(results, { status: 200 });
  }
  const r = await handle(key, body);
  if (r === null) return new Response(null, { status: 202 });
  return Response.json(r);
}

export async function GET() {
  // Streamable HTTP spec: server có thể trả 405 cho GET nếu không SSE
  return Response.json({ error: "Method not allowed — dùng POST" }, { status: 405 });
}

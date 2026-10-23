// OAuth 2.1 authorization endpoint cho MCP.
//
// Luồng: client (ChatGPT) mở URL này trong trình duyệt. Người dùng đăng nhập
// bằng Google/ChatGPT, chọn MCP key muốn cấp quyền, rồi hệ thống redirect
// về client với authorization code.
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { createAuthCode, findClient } from "@/lib/mcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const scope = url.searchParams.get("scope") ?? "mcp:read";
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") ?? "";
  const responseType = url.searchParams.get("response_type") ?? "code";

  const client = await findClient(clientId);
  if (!client) {
    return new Response("Client không hợp lệ.", { status: 400 });
  }
  if (responseType !== "code") {
    return new Response("Chỉ hỗ trợ response_type=code.", { status: 400 });
  }
  if (!codeChallenge) {
    return new Response("Thiếu code_challenge — MCP OAuth bắt buộc PKCE.", { status: 400 });
  }
  if ((codeChallengeMethod || "S256").toUpperCase() !== "S256") {
    return new Response("Chỉ hỗ trợ code_challenge_method=S256.", { status: 400 });
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return new Response("redirect_uri không khớp client đã đăng ký.", { status: 400 });
  }

  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) {
    // Chưa đăng nhập -> đưa về trang login, rồi quay lại authorize.
    const login = new URL("/login", url.origin);
    login.searchParams.set("callbackUrl", url.pathname + url.search);
    return Response.redirect(login.toString());
  }

  // Các key MCP mà user này sở hữu trong biz.
  const keys = await db
    .select({
      id: schema.mcpKeys.id,
      name: schema.mcpKeys.name,
      keyPrefix: schema.mcpKeys.keyPrefix,
      status: schema.mcpKeys.status,
      bizId: schema.mcpKeys.bizId,
      bizName: schema.bizs.name,
      bizSlug: schema.bizs.slug,
    })
    .from(schema.mcpKeys)
    .innerJoin(schema.bizs, eq(schema.mcpKeys.bizId, schema.bizs.id))
    .innerJoin(
      schema.members,
      and(eq(schema.members.bizId, schema.mcpKeys.bizId), eq(schema.members.userId, userId)),
    )
    .where(eq(schema.mcpKeys.status, "active"));

  if (!keys.length) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:40px">
       <h2>Chưa có API key MCP nào</h2>
       <p>Vào AdsSync → MCP Server → API key MCP và tạo một key, rồi thử lại.</p></body>`,
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const options = keys
    .map(
      (k) => `<option value="${esc(k.id)}">${esc(k.name || k.keyPrefix)} — ${esc(k.bizName)} (${esc(k.keyPrefix)}…)</option>`,
    )
    .join("");

  const action = "/mcp/oauth/authorize";

  return new Response(
    `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Cấp quyền cho AI</title>
<style>body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f4f6fa;color:#0f172a;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:520px;padding:32px;border-radius:14px;background:#fff;border:1px solid #e6eaf0;box-shadow:0 8px 24px -14px rgba(15,23,42,.2)}
h1{font-size:19px;margin:0 0 6px;font-weight:700;letter-spacing:-.01em}p{color:#64748b;font-size:13.5px;margin:0 0 16px}
label{display:block;font-size:13px;color:#334155;margin:12px 0 6px}
select{width:100%;padding:10px;border-radius:10px;border:1px solid #d7dde6;background:#fff;color:#0f172a;font-size:14px}
button{margin-top:20px;background:#2563eb;color:#fff;border:0;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
.note{margin-top:16px;font-size:12px;color:#64748b}
</style></head><body><div class="card">
<h1>Cấp quyền cho ${esc(client.clientName || "AI client")}</h1>
<p>Chọn API key MCP mà AI sẽ dùng. Mọi lệnh ghi vẫn phải được bạn duyệt trong app.</p>
<form method="POST" action="${esc(action)}">
  <input type="hidden" name="client_id" value="${esc(clientId)}" />
  <input type="hidden" name="redirect_uri" value="${esc(redirectUri)}" />
  <input type="hidden" name="state" value="${esc(state)}" />
  <input type="hidden" name="scope" value="${esc(scope)}" />
  <input type="hidden" name="code_challenge" value="${esc(codeChallenge)}" />
  <input type="hidden" name="code_challenge_method" value="${esc(codeChallengeMethod)}" />
  <label for="key">API key MCP</label>
  <select id="key" name="key_id">${options}</select>
  <button type="submit">Cấp quyền</button>
</form>
<p class="note">Sau khi cấp quyền, bạn quay lại ChatGPT để AI bắt đầu dùng hệ thống.</p>
</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

// Bấm "Cấp quyền" -> sinh authorization code -> redirect về client.
export async function POST(req: Request) {
  const form = await req.formData();
  const get = (k: string) => String(form.get(k) ?? "");

  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const state = get("state");
  const scope = get("scope") || "mcp:read";
  const codeChallenge = get("code_challenge");
  const codeChallengeMethod = get("code_challenge_method");
  const keyId = get("key_id");

  const client = await findClient(clientId);
  if (!client) return new Response("Client không hợp lệ.", { status: 400 });
  if (!codeChallenge) return new Response("Thiếu code_challenge — MCP OAuth bắt buộc PKCE.", { status: 400 });
  if ((codeChallengeMethod || "S256").toUpperCase() !== "S256") {
    return new Response("Chỉ hỗ trợ code_challenge_method=S256.", { status: 400 });
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return new Response("redirect_uri không khớp.", { status: 400 });
  }

  const session = await auth();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return new Response("Chưa đăng nhập.", { status: 401 });

  const [key] = await db.select().from(schema.mcpKeys).where(eq(schema.mcpKeys.id, keyId)).limit(1);
  if (!key || key.status !== "active") return new Response("Key không hợp lệ.", { status: 400 });

  // Người dùng phải là thành viên của biz chứa key.
  const [member] = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(and(eq(schema.members.bizId, key.bizId), eq(schema.members.userId, userId)))
    .limit(1);
  if (!member) return new Response("Bạn không có quyền với key này.", { status: 403 });

  const code = await createAuthCode({
    clientId,
    userId,
    bizId: key.bizId,
    keyId: key.id,
    redirectUri,
    scope,
    codeChallenge: codeChallenge || null,
    codeChallengeMethod: codeChallengeMethod || null,
  });

  await logActivity({
    bizId: key.bizId,
    actorId: userId,
    action: "mcp_oauth.grant",
    objectType: "mcp_key",
    objectId: key.id,
    detail: { clientId, clientName: client.clientName, scope },
  });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  return Response.redirect(target.toString());
}

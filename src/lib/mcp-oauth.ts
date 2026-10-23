// OAuth 2.1 cho MCP server — để AI khác (ChatGPT, Claude, Cursor…) đăng nhập
// và gọi tool trực tiếp mà không cần copy API key.
//
// Luồng chuẩn OAuth 2.1 + PKCE:
//   1. Client POST /mcp/oauth/register            -> client_id + client_secret
//   2. Client GET  /mcp/oauth/authorize?...        -> người dùng đăng nhập + duyệt
//   3. Client POST /mcp/oauth/token (code + PKCE)  -> access_token + refresh_token
//   4. Client POST /mcp  (Authorization: Bearer)   -> gọi tool
//
// Token gắn với một MCP key có sẵn nên quyền đọc/ghi, bộ chỉ số và skill
// đều theo key đó. Mọi lệnh ghi vẫn qua Approval Gate.
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { sha256 } from "./crypto";

export const OAUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 phút
export const OAUTH_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 giờ
export const OAUTH_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày

export const MCP_SCOPE_READ = "mcp:read";
export const MCP_SCOPE_WRITE = "mcp:write";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return sha256(token);
}

/** So sánh chuỗi không rò rỉ thời gian. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Tạo client mới (dynamic client registration — DCR). */
export async function registerClient(input: {
  clientName?: string | null;
  redirectUris: string[];
}): Promise<{ clientId: string; clientSecret: string; clientIdIssuedAt: number }> {
  const clientId = `mcp_${randomToken(18)}`;
  const clientSecret = randomToken(32);
  await db.insert(schema.mcpOauthClients).values({
    clientId,
    clientSecretHash: hashToken(clientSecret),
    clientName: input.clientName ?? null,
    redirectUris: input.redirectUris,
  });
  return { clientId, clientSecret, clientIdIssuedAt: Math.floor(Date.now() / 1000) };
}

export async function findClient(clientId: string) {
  const rows = await db.select().from(schema.mcpOauthClients)
    .where(eq(schema.mcpOauthClients.clientId, clientId)).limit(1);
  return rows[0] ?? null;
}

export async function verifyClientSecret(clientId: string, clientSecret: string): Promise<boolean> {
  const client = await findClient(clientId);
  if (!client) return false;
  return safeEqual(client.clientSecretHash, hashToken(clientSecret));
}

/** Tạo authorization code kèm PKCE challenge. */
export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  bizId: string;
  keyId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string | null;
  codeChallengeMethod?: string | null;
}): Promise<string> {
  const code = randomToken(32);
  await db.insert(schema.mcpOauthCodes).values({
    codeHash: hashToken(code),
    clientId: input.clientId,
    userId: input.userId,
    bizId: input.bizId,
    keyId: input.keyId,
    redirectUri: input.redirectUri,
    scope: input.scope,
    codeChallenge: input.codeChallenge ?? null,
    codeChallengeMethod: input.codeChallengeMethod ?? null,
    expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
  });
  return code;
}

/**
 * Đổi authorization code lấy token.
 * Trả về null nếu code sai/hết hạn/đã dùng. Nếu có PKCE thì bắt buộc
 * code_verifier khớp challenge.
 */
export async function exchangeCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier?: string | null;
}): Promise<
  | { accessToken: string; refreshToken: string; expiresIn: number; scope: string; keyId: string }
  | { error: string }
> {
  const rows = await db.select().from(schema.mcpOauthCodes)
    .where(eq(schema.mcpOauthCodes.codeHash, hashToken(input.code))).limit(1);
  const row = rows[0];
  if (!row) return { error: "invalid_grant" };
  if (row.usedAt) return { error: "invalid_grant" };
  if (row.expiresAt < new Date()) return { error: "invalid_grant" };
  if (row.clientId !== input.clientId) return { error: "invalid_client" };
  if (row.redirectUri !== input.redirectUri) return { error: "invalid_grant" };

  if (row.codeChallenge) {
    if (!input.codeVerifier) return { error: "invalid_request" };
    const method = (row.codeChallengeMethod ?? "S256").toUpperCase();
    const computed =
      method === "S256"
        ? createHash("sha256").update(input.codeVerifier).digest("base64url")
        : createHash("sha256").update(input.codeVerifier).digest("hex");
    if (!safeEqual(computed, row.codeChallenge)) return { error: "invalid_grant" };
  }

  await db.update(schema.mcpOauthCodes).set({ usedAt: new Date() })
    .where(eq(schema.mcpOauthCodes.id, row.id));

  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  await db.insert(schema.mcpOauthTokens).values({
    clientId: row.clientId,
    userId: row.userId,
    bizId: row.bizId,
    keyId: row.keyId,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    scope: row.scope,
    expiresAt: new Date(Date.now() + OAUTH_TOKEN_TTL_MS),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(OAUTH_TOKEN_TTL_MS / 1000),
    scope: row.scope,
    keyId: row.keyId,
  };
}

/** Đổi refresh token lấy access token mới. */
export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
}): Promise<{ accessToken: string; expiresIn: number; scope: string; keyId: string } | { error: string }> {
  const rows = await db.select().from(schema.mcpOauthTokens)
    .where(eq(schema.mcpOauthTokens.refreshTokenHash, hashToken(input.refreshToken))).limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return { error: "invalid_grant" };
  if (row.clientId !== input.clientId) return { error: "invalid_client" };

  const accessToken = randomToken(32);
  const newRefresh = randomToken(32);
  await db
    .update(schema.mcpOauthTokens)
    .set({
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(newRefresh),
      expiresAt: new Date(Date.now() + OAUTH_TOKEN_TTL_MS),
    })
    .where(eq(schema.mcpOauthTokens.id, row.id));

  return {
    accessToken,
    expiresIn: Math.floor(OAUTH_TOKEN_TTL_MS / 1000),
    scope: row.scope,
    keyId: row.keyId,
  };
}

/**
 * Tìm key tương ứng với bearer token.
 * Đây là điểm nối giữa OAuth và lớp tool hiện có: token vẫn chạy tool với
 * đúng quyền/bộ chỉ số/skill của key gốc.
 */
export async function resolveAccessToken(raw: string | null): Promise<{
  key: typeof schema.mcpKeys.$inferSelect;
  scope: string;
  userId: string;
  bizId: string;
} | null> {
  if (!raw) return null;
  const rows = await db.select().from(schema.mcpOauthTokens)
    .where(eq(schema.mcpOauthTokens.accessTokenHash, hashToken(raw))).limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) return null;
  if (row.expiresAt < new Date()) return null;
  const [key] = await db.select().from(schema.mcpKeys)
    .where(eq(schema.mcpKeys.id, row.keyId)).limit(1);
  if (!key || key.status !== "active") return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  return { key, scope: row.scope, userId: row.userId, bizId: row.bizId };
}

/** Thu hồi toàn bộ token của một client (khi gỡ kết nối AI). */
export async function revokeClientTokens(clientId: string) {
  await db.update(schema.mcpOauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.mcpOauthTokens.clientId, clientId)));
}

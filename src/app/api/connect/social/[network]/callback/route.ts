// OAuth callback các mạng social mới → đổi code, dò danh tính, lưu connection.
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { saveOAuthConnection } from "@/lib/connection-store";
import { logActivity } from "@/lib/audit";
import { exchangeSocialCode, socialClient, SOCIAL_NETWORKS, verifySocialState } from "@/lib/social-oauth";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;
  const def = SOCIAL_NETWORKS[network];
  const url = new URL(req.url);
  const slugQ = url.searchParams.get("state");
  const st = verifySocialState(slugQ ?? "");
  const appUrl = (process.env.APP_URL ?? url.origin).replace(/\/$/, "");
  const back = (q: Record<string, string>) =>
    Response.redirect(`${appUrl}/biz/${st?.slug ?? ""}/dashboard/connections?` + new URLSearchParams(q));

  if (!def) return Response.json({ error: "network không hỗ trợ" }, { status: 404 });
  if (url.searchParams.get("error")) {
    return back({ error: "social_oauth", msg: url.searchParams.get("error_description") ?? "Nhà cung cấp từ chối." });
  }
  const code = url.searchParams.get("code");
  if (!code || !st?.slug) return back({ error: "social_state", msg: "Phiên đăng nhập hết hạn — thử lại." });

  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.slug, st.slug)).limit(1);
  if (!biz) return back({ error: "biz_not_found" });

  const client = socialClient(def);
  if (!client) return back({ error: "social_config", msg: `Thiếu ${def.clientIdEnv[0]} — xem docs/ADAPTERS.md` });

  const redirectUri = new URL(`/api/connect/social/${network}/callback`, appUrl).toString();
  try {
    const tokens = await exchangeSocialCode(def, client, code, redirectUri, st.verifier);
    if (!tokens.access_token) throw new Error("Không đổi được access token");
    const identity = await def.resolveIdentity(tokens.access_token).catch(() => ({ refId: null, name: def.label }));
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;

    // Connection cùng mạng + cùng refId → cập nhật lại token, không nhân bản.
    const existing = await db.select().from(schema.connections)
      .where(eq(schema.connections.bizId, biz.id));
    const matched = existing.find(
      (c) => c.provider === network && (c.meta as any)?.userRef && (c.meta as any).userRef === identity.refId,
    );
    const { row } = await saveOAuthConnection({
      bizId: biz.id,
      existingId: matched?.id ?? null,
      provider: network as "x_twitter" | "linkedin" | "tiktok" | "threads" | "pinterest",
      name: identity.name || def.label,
      secret: {
        access_token: tokens.access_token,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      },
      meta: {
        userRef: identity.refId,
        tokenExpiresAt: expiresAt,
        scopes: def.scopes,
      },
    });
    await logActivity({
      bizId: biz.id, action: matched ? "connection.update" : "connection.create",
      objectType: "connection", objectId: row.id,
      detail: { provider: network, via: "oauth_social", name: identity.name },
    });
    return back({ success: network });
  } catch (e: any) {
    return back({ error: "social_exchange", msg: String(e?.message ?? e).slice(0, 180) });
  }
}

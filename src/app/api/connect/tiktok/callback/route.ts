// TikTok Ads OAuth — Bước 2: exchange auth_code -> access_token -> lưu connection.
import { createHmac, timingSafeEqual } from "crypto";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { checkHealth } from "@/lib/providers";
import { saveOAuthConnection } from "@/lib/connection-store";
import { logActivity } from "@/lib/audit";
import { grantedKeys, missingScopes } from "@/lib/oauth-scopes";

import { mockMode, requestAppUrl } from "@/lib/self-hosted-config";
import { oauthResultUrl } from "@/lib/oauth-result";
import { countAdAccounts, getBizPlan, quotasEnforced } from "@/lib/plan-quota";

export const runtime = "nodejs";

function verifyState(state: string): { slug: string; conn?: string; scope?: string[] } | null {
  const [data, sig] = state.split(".");
  if (!data || !sig) return null;
  const expect = createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev-secret").update(data).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectBuf = Buffer.from(expect);
  if (sigBuf.length !== expectBuf.length || !timingSafeEqual(sigBuf, expectBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    // State chỉ có hiệu lực 10 phút — chặn replay state cũ.
    if (!payload?.ts || Date.now() - Number(payload.ts) > 10 * 60_000) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authCode = url.searchParams.get("auth_code");
  const isMock = url.searchParams.get("mock") === "1" && process.env.SELF_HOSTED === "true" && mockMode();
  const st = verifyState(url.searchParams.get("state") ?? "");

  const appUrl = requestAppUrl(req);

  // TikTok báo lỗi qua query param (người dùng hủy hoặc app chưa được duyệt).
  const errCode = url.searchParams.get("error");
  if (errCode) {
    const slug = st?.slug ?? "";
    const reason = url.searchParams.get("error_description") ?? "";
    return Response.redirect(
      oauthResultUrl({
        appUrl,
        provider: "tiktok",
        status: "error",
        slug,
        error: "tiktok_oauth",
        code: errCode,
        msg: reason || `TikTok từ chối cấp quyền (${errCode}).`,
      }),
    );
  }

  if (!authCode || !st) {
    return Response.json({ error: "invalid_state_or_code" }, { status: 400 });
  }

  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.slug, st.slug)).limit(1);
  if (!biz) return Response.json({ error: "biz_not_found" }, { status: 404 });

  let accessToken = "";
  let refreshToken = "";
  let accessTokenExpireAt: string | null = null;
  let refreshTokenExpireAt: string | null = null;
  let advertisers: any[] = [];
  let grantedScopeRaw = "";

  if (isMock) {
    accessToken = `mock_tiktok_tok_${Date.now()}`;
    advertisers = [
      { advertiser_id: "adv_tiktok_7182930491", advertiser_name: "TikTok Shop Flagship VN", status: "STATUS_ENABLE" }
    ];
    grantedScopeRaw = "ads.read,ads.management,agent.advertiser";
  } else {
    const appId = process.env.TIKTOK_APP_ID;
    const secret = process.env.TIKTOK_APP_SECRET;

    const tokenRes = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: appId,
        secret: secret,
        auth_code: authCode,
      }),
    }).then((r) => r.json());

    if (tokenRes.code !== 0 || !tokenRes.data?.access_token) {
      return Response.redirect(
        oauthResultUrl({
          appUrl,
          provider: "tiktok",
          status: "error",
          slug: st.slug,
          error: "tiktok_exchange",
          msg: tokenRes.message ?? "Không đổi được token từ TikTok.",
        }),
      );
    }

    accessToken = tokenRes.data.access_token;
    refreshToken = String(tokenRes.data.refresh_token ?? "");
    grantedScopeRaw = String(tokenRes.data.scope ?? "");
    const accessExpiresIn = Number(tokenRes.data.access_token_expire_in ?? tokenRes.data.expires_in ?? 0);
    const refreshExpiresIn = Number(tokenRes.data.refresh_token_expire_in ?? 0);
    accessTokenExpireAt = accessExpiresIn > 0 ? new Date(Date.now() + accessExpiresIn * 1000).toISOString() : null;
    refreshTokenExpireAt = refreshExpiresIn > 0 ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString() : null;
    const advIds = tokenRes.data.advertiser_ids || [];

    // Query chi tiết tài khoản
    if (advIds.length > 0) {
      const advRes = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/", {
        headers: { "Access-Token": accessToken },
      }).then((r) => r.json()).catch(() => ({}));
      advertisers = advRes.data?.list ?? advIds.map((id: string) => ({ advertiser_id: id }));
    }
  }

  const granted = grantedKeys("tiktok", grantedScopeRaw);
  const missing = missingScopes("tiktok", granted);

  if (quotasEnforced()) {
    const { quota } = await getBizPlan(biz.id);
    const adding = Math.max(1, advertisers.length);
    const currentAccounts = await countAdAccounts(biz.id);
    if (currentAccounts + adding > quota.tkqc) {
      return Response.redirect(
        oauthResultUrl({
          appUrl,
          provider: "tiktok",
          status: "error",
          slug: st.slug,
          error: "quota_tkqc",
          msg: `Gói hiện tại cho phép ${quota.tkqc} tài khoản quảng cáo; đang có ${currentAccounts}, thêm ${adding} sẽ vượt hạn mức. Nâng cấp gói rồi thử lại.`,
        }),
      );
    }
  }

  const { row, updated } = await saveOAuthConnection({
    bizId: biz.id,
    existingId: st.conn,
    provider: "tiktok_ads",
    name: "TikTok Ads",
    secret: {
      access_token: accessToken,
      refresh_token: refreshToken,
      access_token_expire_at: accessTokenExpireAt ?? "",
      refresh_token_expire_at: refreshTokenExpireAt ?? "",
    },
    meta: {
      advertisers,
      grantedScopes: granted,
      missingScopes: missing.map((m) => m.key),
      tokenExpiresAt: accessTokenExpireAt,
    },
  });

  await logActivity({
    bizId: biz.id,
    action: updated ? "connection.update" : "connection.create",
    objectType: "connection",
    objectId: row.id,
    detail: {
      provider: "tiktok_ads",
      via: isMock ? "oauth_sandbox" : updated ? "oauth_regrant" : "oauth",
      advertisersCount: advertisers.length,
      grantedScopes: granted,
      missingScopes: missing.map((m) => m.key),
    }
  });

  return Response.redirect(
    oauthResultUrl({ appUrl, provider: "tiktok", status: "ok", slug: st.slug, successLabel: "tiktok" }),
  );
}

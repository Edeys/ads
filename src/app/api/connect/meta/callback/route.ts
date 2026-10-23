// Meta OAuth — bước 2: exchange code -> long-lived token -> lưu connection.
//
// Ba điều quan trọng:
//  1. Facebook trả về `?error=...` khi người dùng hủy hoặc app chưa được duyệt
//     quyền — không xử lý thì người dùng thấy trang trắng / JSON lạ.
//  2. Token đổi sang long-lived phải giữ nguyên danh sách scope đã cấp,
//     nếu không thì các quyền như ads_read bị rớt.
//  3. Lưu lại scope đã cấp để UI hiển thị "thiếu quyền gì" và cho phép cấp bổ sung.
import { createHmac, timingSafeEqual } from "crypto";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { checkHealth } from "@/lib/providers";
import { saveOAuthConnection } from "@/lib/connection-store";
import { logActivity } from "@/lib/audit";
import { grantedKeys, missingScopes } from "@/lib/oauth-scopes";

import { mockMode, requestAppUrl, requestRedirectUri } from "@/lib/self-hosted-config";
import { oauthResultUrl } from "@/lib/oauth-result";
import { countAdAccounts, getBizPlan, quotasEnforced } from "@/lib/plan-quota";

export const runtime = "nodejs";

const GRAPH = "https://graph.facebook.com/v21.0";

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

const ERROR_TEXT: Record<string, string> = {
  access_denied: "Bạn đã từ chối cấp quyền cho AdsSync.",
  invalid_scope: "Một trong các quyền AdsSync yêu cầu chưa được duyệt cho ứng dụng Meta. Hãy thử kết nối lại với nhóm quyền cơ bản.",
  server_error: "Facebook đang lỗi. Thử lại sau ít phút.",
  temporarily_unavailable: "Facebook đang lỗi tạm thời. Thử lại sau ít phút.",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const isMock = url.searchParams.get("mock") === "1" && process.env.SELF_HOSTED === "true" && mockMode();
  const st = verifyState(url.searchParams.get("state") ?? "");

  const appUrl = requestAppUrl(req);

  // Facebook báo lỗi qua query param, không qua HTTP status.
  const errCode = url.searchParams.get("error");
  if (errCode) {
    const slug = st?.slug ?? url.searchParams.get("slug") ?? "";
    const reason = url.searchParams.get("error_description") ?? "";
    console.error("[meta-oauth] provider error", {
      slug,
      error: errCode,
      error_code: url.searchParams.get("error_code"),
      error_reason: url.searchParams.get("error_reason"),
      description: reason,
    });
    const msg = ERROR_TEXT[errCode] ?? `Meta từ chối cấp quyền (${errCode}).`;
    return Response.redirect(
      oauthResultUrl({
        appUrl,
        provider: "meta",
        status: "error",
        slug,
        error: "meta_oauth",
        code: errCode,
        msg: reason || msg,
      }),
    );
  }

  if (!code || !st) return Response.json({ error: "invalid_state_or_code" }, { status: 400 });

  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.slug, st.slug)).limit(1);
  if (!biz) return Response.json({ error: "biz_not_found" }, { status: 404 });

  let accessToken = "";
  let metaData: Record<string, unknown> = {};
  let grantedScopeRaw = "";

  if (isMock) {
    accessToken = `mock_meta_access_tok_${Date.now()}`;
    metaData = {
      adAccounts: [
        { id: "act_1029384756", name: "Tài khoản QC Chính - VN", status: 1, currency: "VND" },
        { id: "act_5647382910", name: "Tài khoản QC Dự phòng", status: 1, currency: "VND" }
      ],
      pages: [
        { id: "page_987654321", name: "Flagship Store Official" },
        { id: "page_123456789", name: "Sản Phẩm Gia Dụng VN" }
      ],
      grantedScopes: ["ads_read", "ads_management", "business_management", "pages_show_list", "pages_read_engagement"],
    };
  } else {
    const redirect = requestRedirectUri(req, "meta");
    // code -> short-lived token
    const tokRes = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&redirect_uri=${encodeURIComponent(redirect)}&code=${code}`
    ).then((r) => r.json());
    if (!tokRes.access_token) {
      console.error("[meta-oauth] token exchange failed", {
        slug: st.slug,
        type: tokRes.error?.type,
        code: tokRes.error?.code,
        subcode: tokRes.error?.error_subcode,
        message: tokRes.error?.message,
      });
      return Response.redirect(
        oauthResultUrl({
          appUrl,
          provider: "meta",
          status: "error",
          slug: st.slug,
          error: "meta_exchange",
          msg: tokRes.error?.message ?? "Không đổi được token từ Facebook.",
        }),
      );
    }
    grantedScopeRaw = String(tokRes.scope ?? "");

    // -> long-lived token (~60 ngày). Giữ nguyên scope đã cấp, nếu không thì
    // các quyền đọc sẽ biến mất khỏi token dài hạn.
    const longRes = await fetch(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.META_APP_ID}&client_secret=${process.env.META_APP_SECRET}&fb_exchange_token=${tokRes.access_token}`
    ).then((r) => r.json());
    accessToken = longRes.access_token ?? tokRes.access_token;
    grantedScopeRaw = String(longRes.scope ?? grantedScopeRaw);

    const health = await checkHealth({ provider: "meta_ads", secret: { access_token: accessToken }, meta: {} });
    metaData = health.meta ?? {};
  }

  const granted = grantedKeys("meta", grantedScopeRaw || ((metaData.grantedScopes as string[]) ?? []));
  const missing = missingScopes("meta", granted.length ? granted : ((metaData.grantedScopes as string[]) ?? []));
  console.log("[meta-oauth] connected", {
    slug: st.slug,
    granted,
    missing: missing.map((m) => m.key),
    adAccounts: ((metaData.adAccounts as unknown[]) ?? []).length,
    pages: ((metaData.pages as unknown[]) ?? []).length,
  });

  if (quotasEnforced()) {
    const { quota } = await getBizPlan(biz.id);
    const adding = Math.max(1, ((metaData.adAccounts as unknown[]) ?? []).length);
    const currentAccounts = await countAdAccounts(biz.id);
    if (currentAccounts + adding > quota.tkqc) {
      return Response.redirect(
        oauthResultUrl({
          appUrl,
          provider: "meta",
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
    provider: "meta_ads",
    name: "Meta Ads",
    secret: { access_token: accessToken },
    meta: { ...metaData, grantedScopes: granted, missingScopes: missing.map((m) => m.key) },
  });

  await logActivity({
    bizId: biz.id,
    action: updated ? "connection.update" : "connection.create",
    objectType: "connection",
    objectId: row.id,
    detail: {
      provider: "meta_ads",
      via: isMock ? "oauth_sandbox" : updated ? "oauth_regrant" : "oauth",
      accountsCount: ((metaData.adAccounts as any[]) ?? []).length,
      grantedScopes: granted,
      missingScopes: missing.map((m) => m.key),
    }
  });

  return Response.redirect(
    oauthResultUrl({ appUrl, provider: "meta", status: "ok", slug: st.slug, successLabel: "meta_ads" }),
  );
}

// Google OAuth — bước 2: exchange code -> tokens -> lưu connection.
//
// Một callback dùng cho 3 luồng, phân biệt bằng `provider` trong state:
//   • google_ads      → lưu connection google_ads (kèm danh sách TKQC)
//   • search_console  → lưu connection google_search_console (kèm site đã xác minh)
//   • ga4             → lưu connection ga4 (kèm property)
//
// Developer token KHÔNG phải OAuth scope — nó là header bắt buộc của Google Ads
// API và được cấu hình riêng trong env.
import { createHmac, timingSafeEqual } from "crypto";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/audit";
import { saveOAuthConnection } from "@/lib/connection-store";
import { grantedKeys, missingScopes } from "@/lib/oauth-scopes";

import { mockMode, requestAppUrl } from "@/lib/self-hosted-config";
import { oauthResultUrl } from "@/lib/oauth-result";
import { countAdAccounts, getBizPlan, quotasEnforced } from "@/lib/plan-quota";

export const runtime = "nodejs";

const ADS_API = "https://googleads.googleapis.com/v25";

type GoogleFlow = "google_ads" | "search_console" | "ga4";

function verifyState(state: string): { slug: string; conn?: string; provider?: GoogleFlow; scope?: string[] } | null {
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
  const code = url.searchParams.get("code");
  const isMock = url.searchParams.get("mock") === "1" && process.env.SELF_HOSTED === "true" && mockMode();
  const st = verifyState(url.searchParams.get("state") ?? "");

  const appUrl = requestAppUrl(req);

  const errCode = url.searchParams.get("error");
  if (errCode) {
    const slug = st?.slug ?? "";
    const reason = url.searchParams.get("error_description") ?? "";
    return Response.redirect(
      oauthResultUrl({
        appUrl,
        provider: "google",
        status: "error",
        slug,
        error: "google_oauth",
        code: errCode,
        msg: reason || `Google từ chối cấp quyền (${errCode}).`,
      }),
    );
  }

  if (!code || !st) {
    return Response.json({ error: "invalid_state_or_code" }, { status: 400 });
  }

  const [biz] = await db.select().from(schema.bizs).where(eq(schema.bizs.slug, st.slug)).limit(1);
  if (!biz) return Response.json({ error: "biz_not_found" }, { status: 404 });

  const flow: GoogleFlow = st.provider ?? "google_ads";

  let accessToken = "";
  let refreshToken = "";
  let grantedScopeRaw = "";
  let accountEmail = "";

  if (isMock) {
    accessToken = `mock_google_acc_${Date.now()}`;
    refreshToken = `mock_google_ref_${Date.now()}`;
    grantedScopeRaw =
      flow === "search_console"
        ? "https://www.googleapis.com/auth/webmasters.readonly openid https://www.googleapis.com/auth/userinfo.email"
        : flow === "ga4"
          ? "https://www.googleapis.com/auth/analytics.readonly openid https://www.googleapis.com/auth/userinfo.email"
          : "https://www.googleapis.com/auth/adwords openid https://www.googleapis.com/auth/userinfo.email";
  } else {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    const redirect = `${appUrl}/api/connect/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }).toString(),
    }).then((r) => r.json());

    if (!tokenRes.access_token) {
      return Response.redirect(
        oauthResultUrl({
          appUrl,
          provider: "google",
          status: "error",
          slug: st.slug,
          error: "google_exchange",
          msg: tokenRes.error_description ?? "Không đổi được token từ Google.",
        }),
      );
    }

    accessToken = tokenRes.access_token;
    refreshToken = tokenRes.refresh_token ?? "";
    grantedScopeRaw = String(tokenRes.scope ?? "");

    // Email người dùng (nếu đã cấp userinfo.email) — dùng để gắn tài khoản.
    const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then((r) => (r.ok ? r.json() : {})).catch(() => ({} as Record<string, unknown>));
    accountEmail = String((info as Record<string, unknown>).email ?? "");
  }

  // ---------------------------------------------------- Google Search Console
  if (flow === "search_console") {
    const granted = grantedKeys("search_console", grantedScopeRaw);
    const missing = missingScopes("search_console", granted);
    let sites: Array<{ siteUrl: string; permissionLevel: string }> = [];

    if (isMock) {
      sites = [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }];
    } else {
      const res: any = await fetch("https://searchconsole.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      sites = (res.siteEntry ?? []).map((s: any) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel,
      }));
    }

    const { row, updated } = await saveOAuthConnection({
      bizId: biz.id,
      existingId: st.conn,
      provider: "google_search_console",
      name: "Google Search Console",
      secret: {
        access_token: accessToken,
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
      },
      meta: {
        sites: sites.map((s) => s.siteUrl),
        siteDetails: sites,
        grantedScopes: granted,
        missingScopes: missing.map((m) => m.key),
        accountEmail,
      },
    });

    await logActivity({
      bizId: biz.id,
      action: updated ? "connection.update" : "connection.create",
      objectType: "connection",
      objectId: row.id,
      detail: { provider: "google_search_console", via: isMock ? "oauth_sandbox" : "oauth", sites: sites.length },
    });

    return Response.redirect(
      oauthResultUrl({ appUrl, provider: "google", status: "ok", slug: st.slug, successLabel: "google_search_console" }),
    );
  }

  // --------------------------------------------------------------------- GA4
  if (flow === "ga4") {
    const granted = grantedKeys("ga4", grantedScopeRaw);
    const missing = missingScopes("ga4", granted);
    let properties: Array<{ account: string; propertyId: string; property: string }> = [];

    if (isMock) {
      properties = [{ account: "Demo Account", propertyId: "123456789", property: "Demo Property" }];
    } else {
      const res: any = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
      for (const acc of res.accountSummaries ?? []) {
        for (const p of acc.propertySummaries ?? []) {
          properties.push({
            account: acc.displayName ?? "",
            propertyId: String(p.property ?? "").replace("properties/", ""),
            property: p.displayName ?? "",
          });
        }
      }
    }

    const { row, updated } = await saveOAuthConnection({
      bizId: biz.id,
      existingId: st.conn,
      provider: "ga4",
      name: "Google Analytics 4",
      secret: {
        access_token: accessToken,
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
      },
      meta: {
        properties,
        defaultPropertyId: properties[0]?.propertyId ?? null,
        grantedScopes: granted,
        missingScopes: missing.map((m) => m.key),
        accountEmail,
      },
    });

    await logActivity({
      bizId: biz.id,
      action: updated ? "connection.update" : "connection.create",
      objectType: "connection",
      objectId: row.id,
      detail: { provider: "ga4", via: isMock ? "oauth_sandbox" : "oauth", properties: properties.length },
    });

    return Response.redirect(
      oauthResultUrl({ appUrl, provider: "google", status: "ok", slug: st.slug, successLabel: "ga4" }),
    );
  }

  // ------------------------------------------------------------- Google Ads
  let customers: any[] = [];

  if (isMock) {
    customers = [{ id: "123-456-7890", descriptiveName: "Google Ads VN Store", currencyCode: "VND" }];
  } else {
    // Danh sách tài khoản quảng cáo — cần developer token.
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (devToken) {
      const custRes = await fetch(`${ADS_API}/customers:listAccessibleCustomers`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": devToken,
        },
      }).then((r) => r.json()).catch(() => ({}));
      const ids: string[] = (custRes.resourceNames ?? []).map((rn: string) => rn.replace("customers/", ""));
      // Lấy tên + tiền tệ cho từng tài khoản để UI hiển thị.
      for (const id of ids.slice(0, 50)) {
        const q = await fetch(`${ADS_API}/customers/${id.replace(/-/g, "")}/googleAds:search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": devToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({ query: "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager, customer.status FROM customer" }),
        }).then((r) => r.json()).catch(() => ({}));
        const c = q.results?.[0]?.customer;
        customers.push({
          id: c?.id ? String(c.id).replace(/(\d{3})(\d{3})(\d{3})(\d+)/, "$1-$2-$3-$4") : id,
          descriptiveName: c?.descriptiveName ?? id,
          currencyCode: c?.currencyCode ?? null,
          manager: Boolean(c?.manager),
          status: c?.status ?? null,
        });
      }
    }
  }

  const granted = grantedKeys("google", grantedScopeRaw);
  const missing = missingScopes("google", granted);
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? null;

  if (quotasEnforced()) {
    const { quota } = await getBizPlan(biz.id);
    const adding = Math.max(1, customers.length);
    const currentAccounts = await countAdAccounts(biz.id);
    if (currentAccounts + adding > quota.tkqc) {
      return Response.redirect(
        oauthResultUrl({
          appUrl,
          provider: "google",
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
    provider: "google_ads",
    name: "Google Ads",
    secret: {
      access_token: accessToken,
      refresh_token: refreshToken,
      // Lưu client id/secret để tự refresh token khi hết hạn.
      client_id: process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
      developer_token: devToken ?? "",
    },
    meta: {
      customers,
      grantedScopes: granted,
      missingScopes: missing.map((m) => m.key),
      hasDeveloperToken: Boolean(devToken),
      accountEmail,
    },
  });

  await logActivity({
    bizId: biz.id,
    action: updated ? "connection.update" : "connection.create",
    objectType: "connection",
    objectId: row.id,
    detail: {
      provider: "google_ads",
      via: isMock ? "oauth_sandbox" : updated ? "oauth_regrant" : "oauth",
      customersCount: customers.length,
      grantedScopes: granted,
      missingScopes: missing.map((m) => m.key),
      hasDeveloperToken: Boolean(devToken),
    }
  });

  return Response.redirect(
    oauthResultUrl({ appUrl, provider: "google", status: "ok", slug: st.slug, successLabel: "google_ads" }),
  );
}

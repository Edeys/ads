// Google Search Console + GA4: dùng chung refresh token OAuth của Google.
//
// Access token Google chỉ sống 1 giờ, nên mọi tool đều refresh từ refresh_token
// đã lưu trong connection. Client id/secret lấy từ secret của connection, fallback
// về biến môi trường GOOGLE_CLIENT_ID/SECRET (cùng OAuth app với đăng nhập).
import { db } from "@/db";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { fetchT } from "@/lib/http";

export type GoogleDataProvider = "google_search_console" | "ga4";

type AuthResult = {
  token: string;
  secret: Record<string, string>;
  meta: Record<string, unknown>;
  connId: string;
};

export async function googleDataAuth(credentialId: string, expected: GoogleDataProvider): Promise<AuthResult> {
  const [conn] = await db.select().from(connections).where(eq(connections.id, credentialId)).limit(1);
  if (!conn) throw new Error("Kết nối Google không tồn tại");
  if (conn.provider !== expected) {
    throw new Error(`credential này là ${conn.provider}, không phải ${expected}`);
  }

  const secret = decryptSecret((conn.secret as any).enc);
  const meta = (conn.meta ?? {}) as Record<string, unknown>;

  const clientId = secret.client_id || process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID || "";
  const clientSecret =
    secret.client_secret || process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET || "";

  let token = secret.access_token ?? "";

  if (secret.refresh_token && clientId && clientSecret) {
    const res = await fetchT("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: secret.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.access_token) {
      token = String(j.access_token);
      secret.access_token = token;
      await db
        .update(connections)
        .set({ secret: { enc: encryptSecret(secret) } })
        .where(eq(connections.id, conn.id))
        .catch(() => {});
    }
  }

  if (!token) throw new Error("Không có access token — kết nối lại Google để cấp quyền.");

  return { token, secret, meta, connId: conn.id };
}

async function googleGet(url: string, token: string) {
  const res = await fetchT(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (j as any)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Google API: ${msg}`);
  }
  return j;
}

async function googlePost(url: string, token: string, body: unknown) {
  const res = await fetchT(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (j as any)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Google API: ${msg}`);
  }
  return j;
}

// --------------------------------------------------------- Search Console ---

export async function searchConsoleListSites(credentialId: string) {
  const { token } = await googleDataAuth(credentialId, "google_search_console");
  const j = await googleGet("https://searchconsole.googleapis.com/webmasters/v3/sites", token);
  return (j.siteEntry ?? []).map((s: any) => ({
    site_url: s.siteUrl,
    permission: s.permissionLevel,
  }));
}

export async function searchConsoleQuery(
  credentialId: string,
  siteUrl: string,
  opts: {
    startDate?: string;
    endDate?: string;
    dimensions?: string[];
    rowLimit?: number;
  } = {},
) {
  const { token } = await googleDataAuth(credentialId, "google_search_console");
  if (!siteUrl) throw new Error("Thiếu site_url — gọi search_console_list_sites để lấy danh sách.");

  const endDate = opts.endDate ?? new Date(Date.now() - 86400e3).toISOString().slice(0, 10);
  const startDate = opts.startDate ?? new Date(Date.now() - 28 * 86400e3).toISOString().slice(0, 10);
  const dimensions = (opts.dimensions?.length ? opts.dimensions : ["query"]).slice(0, 3);
  const rowLimit = Math.min(Math.max(Number(opts.rowLimit ?? 100), 1), 25000);

  const encoded = encodeURIComponent(siteUrl);
  const j = await googlePost(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    token,
    { startDate, endDate, dimensions, rowLimit },
  );

  return {
    site_url: siteUrl,
    start_date: startDate,
    end_date: endDate,
    dimensions,
    rows: (j.rows ?? []).map((r: any) => ({
      keys: r.keys ?? [],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    })),
  };
}

// --------------------------------------------------------------------- GA4 ---

export async function ga4ListProperties(credentialId: string) {
  const { token } = await googleDataAuth(credentialId, "ga4");
  const j = await googleGet("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", token);

  const out: Array<{ account: string; property_id: string; property: string; currency?: string; timezone?: string }> = [];
  for (const acc of j.accountSummaries ?? []) {
    for (const p of acc.propertySummaries ?? []) {
      out.push({
        account: acc.displayName ?? acc.account ?? "",
        property_id: String(p.property ?? "").replace("properties/", ""),
        property: p.displayName ?? "",
      });
    }
  }
  return out;
}

export async function ga4RunReport(
  credentialId: string,
  propertyId: string,
  opts: {
    startDate?: string;
    endDate?: string;
    dimensions?: string[];
    metrics?: string[];
    limit?: number;
  } = {},
) {
  const { token } = await googleDataAuth(credentialId, "ga4");
  const property = String(propertyId).replace("properties/", "").trim();
  if (!property) throw new Error("Thiếu property_id — gọi google_analytics_list_properties để lấy.");

  const endDate = opts.endDate ?? "yesterday";
  const startDate = opts.startDate ?? "28daysAgo";
  const dimensions = (opts.dimensions?.length ? opts.dimensions : ["sessionDefaultChannelGroup"]).slice(0, 9);
  const metrics = (opts.metrics?.length
    ? opts.metrics
    : ["sessions", "totalUsers", "screenPageViews", "conversions"]
  ).slice(0, 10);
  const limit = Math.min(Math.max(Number(opts.limit ?? 100), 1), 10000);

  const j = await googlePost(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, token, {
    dateRanges: [{ startDate, endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    limit,
  });

  return {
    property_id: property,
    start_date: startDate,
    end_date: endDate,
    dimensions,
    metrics,
    rows: (j.rows ?? []).map((r: any) => {
      const row: Record<string, string | number> = {};
      dimensions.forEach((d, i) => {
        row[d] = r.dimensionValues?.[i]?.value ?? "";
      });
      metrics.forEach((m, i) => {
        const v = r.metricValues?.[i]?.value ?? "0";
        row[m] = Number.isFinite(Number(v)) ? Number(v) : v;
      });
      return row;
    }),
  };
}

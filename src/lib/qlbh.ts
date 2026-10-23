// QLBH (Quản lý bán hàng) helpers — đọc đơn hàng từ Pancake, Nhanh.vn, Sapo
import { db } from "@/db";
import { fetchT } from "./http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "./crypto";

export interface OrderItem {
  id: string;
  source: string;
  totalVnd: number;
  status: string;
  customerName?: string;
  customerPhone?: string;
  campaignId?: string;
  createdAt: string;
}

export async function fetchQlbhOrders(credentialId: string, sinceDate?: string): Promise<OrderItem[]> {
  const [conn] = await db.select().from(connections).where(eq(connections.id, credentialId)).limit(1);
  if (!conn) throw new Error("Kết nối QLBH không tồn tại");

  const s = decryptSecret((conn.secret as any).enc);

  if (conn.provider.startsWith("pancake")) {
    const res = await fetchT(`https://pos.pancake.vn/api/v1/orders?access_token=${s.access_token}&page_size=50`);
    const j = await res.json().catch(() => ({}));
    return (j.data ?? []).map((o: any) => ({
      id: String(o.id),
      source: "pancake",
      totalVnd: Number(o.total_amount || 0),
      status: String(o.status || "completed"),
      customerName: o.customer?.name,
      customerPhone: o.customer?.phone_number,
      createdAt: o.inserted_at || new Date().toISOString(),
    }));
  }

  if (conn.provider === "nhanhvn") {
    const res = await fetchT("https://open.nhanh.vn/api/order/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version: "2.0",
        appId: s.app_id,
        businessId: s.business_id,
        accessToken: s.access_token,
      }),
    });
    const j = await res.json().catch(() => ({}));
    return Object.values(j.data?.orders ?? {}).map((o: any) => ({
      id: String(o.id),
      source: "nhanhvn",
      totalVnd: Number(o.calcTotalMoney || 0),
      status: String(o.statusCode || "new"),
      customerName: o.customerName,
      customerPhone: o.customerMobile,
      createdAt: o.createdDateTime || new Date().toISOString(),
    }));
  }

  if (conn.provider === "sapo") {
    const res = await fetchT(`https://${conn.name}.mysapo.net/admin/orders.json?limit=50`, {
      headers: { "X-Sapo-Access-Token": s.api_key },
    });
    const j = await res.json().catch(() => ({}));
    return (j.orders ?? []).map((o: any) => ({
      id: String(o.id),
      source: "sapo",
      totalVnd: Number(o.total_price || 0),
      status: String(o.status || "open"),
      customerName: `${o.customer?.first_name || ""} ${o.customer?.last_name || ""}`.trim(),
      customerPhone: o.customer?.phone,
      createdAt: o.created_at || new Date().toISOString(),
    }));
  }

  return [];
}

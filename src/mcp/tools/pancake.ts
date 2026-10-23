import { db } from "@/db";
import { fetchT } from "../../lib/http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "@/lib/crypto";

async function pancakeSecret(connId: string) {
  const [conn] = await db.select().from(connections).where(eq(connections.id, connId)).limit(1);
  if (!conn || !conn.provider.startsWith("pancake")) throw new Error("Pancake connection không tồn tại");
  return decryptSecret((conn.secret as any).enc);
}

export async function pancakeGetShops(connId: string) {
  const s = await pancakeSecret(connId);
  const res = await fetchT(`https://pos.pancake.vn/api/v1/shops?access_token=${s.access_token}&page_size=30`);
  const j = await res.json().catch(() => ({}));
  return j.data ?? [];
}

export async function pancakeGetOrders(connId: string, shopId?: string) {
  const s = await pancakeSecret(connId);
  const param = shopId ? `&shop_id=${shopId}` : "";
  const res = await fetchT(`https://pos.pancake.vn/api/v1/orders?access_token=${s.access_token}&page_size=50${param}`);
  const j = await res.json().catch(() => ({}));
  return j.data ?? [];
}

export async function pancakeGetOrderDetail(connId: string, orderId: string) {
  const s = await pancakeSecret(connId);
  const res = await fetchT(`https://pos.pancake.vn/api/v1/orders/${orderId}?access_token=${s.access_token}`);
  const j = await res.json().catch(() => ({}));
  return j.data ?? j;
}

export async function pancakeGetProducts(connId: string) {
  const s = await pancakeSecret(connId);
  const res = await fetchT(`https://pos.pancake.vn/api/v1/products?access_token=${s.access_token}&page_size=50`);
  const j = await res.json().catch(() => ({}));
  return j.data ?? [];
}

export async function pancakeGetCustomers(connId: string) {
  const s = await pancakeSecret(connId);
  const res = await fetchT(`https://pos.pancake.vn/api/v1/customers?access_token=${s.access_token}&page_size=50`);
  const j = await res.json().catch(() => ({}));
  return j.data ?? [];
}

export async function pancakeGetInventory(connId: string) {
  const s = await pancakeSecret(connId);
  const res = await fetchT(`https://pos.pancake.vn/api/v1/inventories?access_token=${s.access_token}&page_size=50`);
  const j = await res.json().catch(() => ({}));
  return j.data ?? [];
}

export async function pancakeGetStatistics(connId: string) {
  const s = await pancakeSecret(connId);
  const res = await fetchT(`https://pos.pancake.vn/api/v1/statistics?access_token=${s.access_token}`);
  const j = await res.json().catch(() => ({}));
  return j.data ?? j;
}

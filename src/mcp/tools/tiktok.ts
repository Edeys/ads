import { tiktokToken, tiktokGetInsights, tiktokGetGmvMaxStores } from "@/lib/tiktok-ads";
import { fetchT } from "../../lib/http";

export async function tiktokGetAdAccounts(connId: string) {
  const token = await tiktokToken(connId);
  const res = await fetchT("https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/", {
    headers: { "Access-Token": token },
  });
  const j = await res.json().catch(() => ({}));
  return j.data?.list ?? [];
}

export async function tiktokInsights(connId: string, advertiserId: string, startDate?: string, endDate?: string) {
  const token = await tiktokToken(connId);
  return tiktokGetInsights({
    token,
    advertiserId,
    startDate: startDate ?? new Date(Date.now() - 7 * 86400e3).toISOString().split("T")[0],
    endDate: endDate ?? new Date().toISOString().split("T")[0],
  });
}

export async function tiktokGmvStores(connId: string, advertiserId: string) {
  const token = await tiktokToken(connId);
  return tiktokGetGmvMaxStores(token, advertiserId);
}

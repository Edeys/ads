// Notifications — Telegram bot + Zalo bot + webhook tuỳ chọn.
import { db } from "@/db";
import { fetchT } from "./http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "./crypto";

export async function telegramSend(connId: string, text: string) {
  const [conn] = await db.select().from(connections).where(eq(connections.id, connId)).limit(1);
  if (!conn || conn.provider !== "telegram") throw new Error("Telegram connection không tồn tại");
  const token = decryptSecret((conn.secret as any).enc).bot_token;
  const chatId = (conn.meta as any)?.chat_id;
  if (!chatId) throw new Error("Telegram connection thiếu chat_id");
  const res = await fetchT(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`Telegram: ${j.description ?? "send failed"}`);
  return j;
}

export async function zaloSend(connId: string, text: string) {
  const [conn] = await db.select().from(connections).where(eq(connections.id, connId)).limit(1);
  if (!conn || conn.provider !== "zalo_bot") throw new Error("Zalo connection không tồn tại");
  const s = decryptSecret((conn.secret as any).enc);
  const userId = (conn.meta as any)?.user_id;
  const res = await fetchT("https://openapi.zalo.me/v3.0/oa/message/cs", {
    method: "POST",
    headers: {
      access_token: s.access_token,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      recipient: { user_id: userId },
      message: { text },
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.error !== 0) throw new Error(`Zalo: ${j.message ?? "gửi tin thất bại"}`);
  return j;
}

export async function webhookPost(connId: string, payload: Record<string, unknown>) {
  const [conn] = await db.select().from(connections).where(eq(connections.id, connId)).limit(1);
  if (!conn || conn.provider !== "webhook") return;
  const url = (conn.meta as any)?.url;
  if (!url) return;
  await fetchT(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

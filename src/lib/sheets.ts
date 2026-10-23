// Google Sheets qua service account — đọc/ghi/upsert. Token cache 50 phút.
import { db } from "@/db";
import { fetchT } from "./http";
import { connections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decryptSecret } from "./crypto";
import { googleServiceAccountToken } from "./providers";

const tokenCache = new Map<string, { token: string; exp: number }>();

export async function sheetsToken(sheetsConnId: string) {
  const hit = tokenCache.get(sheetsConnId);
  if (hit && hit.exp > Date.now()) return hit.token;
  const [conn] = await db.select().from(connections).where(eq(connections.id, sheetsConnId)).limit(1);
  if (!conn || conn.provider !== "google_sheets") throw new Error("Google Sheets connection không tồn tại");
  const sa = JSON.parse(decryptSecret((conn.secret as any).enc).service_account_json ?? "{}");
  const token = await googleServiceAccountToken(sa, "https://www.googleapis.com/auth/spreadsheets");
  if (!token) throw new Error("Service account không lấy được access token");
  tokenCache.set(sheetsConnId, { token, exp: Date.now() + 50 * 60_000 });
  return token;
}

const API = "https://sheets.googleapis.com/v4/spreadsheets";

export async function sheetGetValues(token: string, sheetId: string, range: string) {
  const res = await fetchT(`${API}/${sheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (j.error) throw new Error(`Sheets: ${j.error.message}`);
  return (j.values ?? []) as string[][];
}

export async function sheetAppend(token: string, sheetId: string, range: string, values: (string | number)[][]) {
  const res = await fetchT(`${API}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Sheets: ${j.error.message}`);
  return j;
}

export async function sheetUpdate(token: string, sheetId: string, range: string, values: (string | number)[][]) {
  const res = await fetchT(`${API}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`Sheets: ${j.error.message}`);
  return j;
}

// Upsert theo key cột (vd ad_id): đọc toàn sheet, match key -> update row, chưa có -> append.
// keyCol = index (0-based) cột chứa key trong header.
export async function sheetUpsert(opts: {
  token: string; sheetId: string; tab: string;
  header: string[]; keyCol: number;
  rows: (string | number)[][]; // mỗi row thứ tự theo header
  keyOf: (row: (string | number)[]) => string;
}) {
  const { token, sheetId, tab, header, keyCol, rows, keyOf } = opts;
  const range = `${tab}!A1`;
  const existing = await sheetGetValues(token, sheetId, `${tab}!A1:ZZ`);

  const hasHeader = existing.length > 0 && String(existing[0][keyCol] ?? "").toLowerCase() === String(header[keyCol]).toLowerCase();
  if (!hasHeader) {
    // sheet trống hoặc thiếu header — ghi header vào đầu
    await sheetUpdate(token, sheetId, `${tab}!A1`, [header]);
    existing.splice(0, existing.length, header);
  }

  // map key -> sheet row number (1-based)
  const idx = new Map<string, number>();
  for (let i = 1; i < existing.length; i++) {
    const k = String(existing[i][keyCol] ?? "");
    if (k && !idx.has(k)) idx.set(k, i + 1);
  }

  let updated = 0, appended = 0;
  const colEnd = colLetter(header.length);
  for (const row of rows) {
    const k = keyOf(row);
    const at = idx.get(k);
    if (at) {
      await sheetUpdate(token, sheetId, `${tab}!A${at}:${colEnd}${at}`, [row]);
      updated++;
    } else {
      await sheetAppend(token, sheetId, `${tab}!A1`, [row]);
      appended++;
    }
  }
  void range;
  return { updated, appended };
}

function colLetter(n: number) {
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

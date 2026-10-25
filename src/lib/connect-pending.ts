// Pending connect — trạng thái giữa bước OAuth popup và bước chọn tài khoản.
//
// Done.vn gọi bước này "select_accounts": sau khi người dùng cấp quyền, server
// quét ad accounts + pages, giữ kết quả ở đây và trả pending_id; UI hiện màn
// chọn tài khoản, người dùng xác nhận thì route confirm mới lưu connection.
//
// In-memory theo đúng ràng buộc single-process của PGlite (không cần migration,
// không có writer thứ hai). TTL 10 phút — hết hạn hoặc server restart thì
// người dùng kết nối lại.
export type PendingAdAccount = {
  id: string;
  name: string;
  status?: number;
  currency?: string;
  timezone?: string;
  businessId?: string | null;
};

export type PendingPage = {
  id: string;
  name: string;
  category?: string | null;
  link?: string | null;
  hasInstagram?: boolean;
};

export type PendingConnect = {
  id: string;
  bizId: string;
  provider: "meta_ads";
  name: string;
  secret: Record<string, string>;
  meta: Record<string, unknown>;
  adAccounts: PendingAdAccount[];
  pages: PendingPage[];
  existingId: string | null;
  expiresAt: number;
};

const TTL_MS = 10 * 60_000;
const store = new Map<string, PendingConnect>();

// Dọn pending hết hạn định kỳ; unref để không giữ event loop của server.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of store) if (value.expiresAt < now) store.delete(key);
}, 60_000);
sweeper.unref?.();

export function savePendingConnect(p: Omit<PendingConnect, "expiresAt">): PendingConnect {
  const row: PendingConnect = { ...p, expiresAt: Date.now() + TTL_MS };
  store.set(row.id, row);
  return row;
}

export function getPendingConnect(id: string): PendingConnect | null {
  const row = store.get(id);
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    store.delete(id);
    return null;
  }
  return row;
}

export function deletePendingConnect(id: string) {
  store.delete(id);
}

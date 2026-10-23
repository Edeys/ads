"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconBell } from "./icons";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsBell({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const res = await fetch(`/api/biz/${slug}/notifications?limit=8`);
      if (!res.ok) return;
      const j = await res.json();
      setItems(j.items ?? []);
      setUnread(j.unread ?? 0);
    } catch {
      /* server local chưa sẵn sàng */
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function markAll() {
    await fetch(`/api/biz/${slug}/notifications`, { method: "PATCH" });
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!loaded) void load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--card)]/70"
        style={{ color: "var(--ink-600)" }}
        title="Thông báo"
      >
        <IconBell size={19} />
        {unread > 0 && (
          <span
            className="absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9.5px] font-bold text-white"
            style={{ background: "var(--danger-ink)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-50 mt-1 w-[320px] overflow-hidden rounded-xl border bg-[var(--card)]"
            style={{ borderColor: "var(--line)", boxShadow: "var(--shadow-pop)" }}
          >
            <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-800)" }}>
                Thông báo
              </span>
              {unread > 0 && (
                <button type="button" onClick={markAll} className="text-[11.5px] font-medium" style={{ color: "var(--brand)" }}>
                  Đánh dấu đã đọc
                </button>
              )}
            </div>

            <div className="ui-scroll max-h-[320px] overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12.5px]" style={{ color: "var(--ink-400)" }}>
                  {loaded ? "Chưa có thông báo nào." : "Đang tải…"}
                </p>
              ) : (
                items.map((n) => {
                  const inner = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-800)" }}>
                          {n.title}
                        </span>
                        {!n.readAt && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />}
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10.5px]" style={{ color: "var(--ink-400)" }}>
                        {new Date(n.createdAt).toLocaleString("vi-VN")}
                      </p>
                    </>
                  );
                  const cls = "block border-b px-3 py-2.5 last:border-0 hover:bg-[var(--surface-3)]";
                  return n.href ? (
                    <Link key={n.id} href={n.href} className={cls} style={{ borderColor: "var(--line)" }} onClick={() => setOpen(false)}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id} className={cls} style={{ borderColor: "var(--line)" }}>
                      {inner}
                    </div>
                  );
                })
              )}
            </div>

            <Link
              href={`/biz/${slug}/dashboard/activity`}
              className="block border-t px-3 py-2 text-center text-[12px] font-medium"
              style={{ borderColor: "var(--line)", color: "var(--brand)" }}
              onClick={() => setOpen(false)}
            >
              Xem nhật ký hoạt động
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

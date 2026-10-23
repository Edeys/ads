"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Thread = {
  id: string;
  kind: string;
  subject: string;
  message: string;
  status: string;
  adminReply: string | null;
  lastMessageAt: string;
};

const KIND_LABEL: Record<string, string> = { support: "Hỗ trợ", bug: "Báo lỗi", feature: "Đề xuất tính năng" };
const STATUS_LABEL: Record<string, string> = { new: "Chờ trả lời", seen: "Đã xem", resolved: "Đã xử lý" };
const STATUS_STYLE: Record<string, { background: string; color: string }> = {
  new: { background: "var(--warn-bg)", color: "var(--warn-ink)" },
  seen: { background: "var(--brand-soft)", color: "var(--brand)" },
  resolved: { background: "var(--ok-bg)", color: "var(--ok-ink)" },
};

const input = "w-full rounded-xl border px-3 py-2 text-[13.5px] outline-none focus:ring-2";

export function SupportClient({ slug, threads }: { slug: string; threads: Thread[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState({ subject: "", kind: "support", message: "" });

  const active = threads.find((t) => t.id === activeId) ?? null;
  const blocks = active ? splitMessage(active.message) : [];

  async function createThread() {
    setBusy(true);
    setMsg("");
    const res = await fetch(`/api/biz/${slug}/support`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(
        j.error === "message_too_short"
          ? "Nội dung cần ít nhất 10 ký tự."
          : j.error === "subject_required"
            ? "Cần nhập tiêu đề (3 ký tự trở lên)."
            : "Không gửi được yêu cầu.",
      );
      return;
    }
    setComposerOpen(false);
    setDraft({ subject: "", kind: "support", message: "" });
    setActiveId(j.id);
    router.refresh();
  }

  async function sendReply() {
    if (!active || !reply.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/biz/${slug}/support/${active.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply }),
    });
    setBusy(false);
    if (res.ok) {
      setReply("");
      router.refresh();
    }
  }

  async function mark(id: string, status: string) {
    setBusy(true);
    await fetch(`/api/biz/${slug}/support/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">Hỗ trợ</h1>
          <p className="ui-sub mt-1.5 max-w-2xl">
            Hỏi đáp, báo lỗi và đề xuất tính năng. Đội hỗ trợ AdsSync trả lời ngay trong từng cuộc trò chuyện.
          </p>
        </div>
        <button type="button" onClick={() => setComposerOpen(true)} className="ui-btn-primary">
          + Cuộc trò chuyện mới
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        {/* Danh sách */}
        <section className="ui-card min-h-[560px] p-4">
          {threads.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 21l1.9-4.1A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
                </svg>
              </div>
              <h2 className="text-[14.5px] font-semibold" style={{ color: "var(--ink-800)" }}>
                Chưa có cuộc trò chuyện nào
              </h2>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                Có câu hỏi, gặp lỗi hay muốn thêm tính năng?
                <br />
                Bắt đầu một cuộc trò chuyện với đội hỗ trợ.
              </p>
              <button type="button" onClick={() => setComposerOpen(true)} className="ui-btn mt-4">
                + Cuộc trò chuyện mới
              </button>
            </div>
          ) : (
            <ul className="space-y-1">
              {threads.map((t) => {
                const on = t.id === activeId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(t.id)}
                      className="w-full rounded-xl px-3 py-2.5 text-left transition-colors"
                      style={on ? { background: "var(--brand-soft)" } : undefined}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="line-clamp-1 text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
                          {t.subject}
                        </span>
                        <span className="ui-chip shrink-0" style={STATUS_STYLE[t.status] ?? STATUS_STYLE.seen}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                        <span>{KIND_LABEL[t.kind] ?? t.kind}</span>
                        <span>·</span>
                        <span>{new Date(t.lastMessageAt).toLocaleString("vi-VN")}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Chi tiết */}
        <section className="ui-card flex min-h-[560px] flex-col p-0">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M4 5h16v11H8l-4 4V5Z" />
                </svg>
              </div>
              <h2 className="text-[15px] font-semibold" style={{ color: "var(--ink-800)" }}>
                Chọn một cuộc trò chuyện
              </h2>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                Chọn ở danh sách bên trái để xem và trả lời, hoặc bắt đầu cuộc trò chuyện mới.
              </p>
            </div>
          ) : (
            <>
              <header className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--line)" }}>
                <div>
                  <h2 className="text-[14.5px] font-semibold" style={{ color: "var(--ink-800)" }}>
                    {active.subject}
                  </h2>
                  <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                    {KIND_LABEL[active.kind] ?? active.kind} · {STATUS_LABEL[active.status] ?? active.status}
                  </p>
                </div>
                {active.status !== "resolved" && (
                  <button
                    type="button"
                    onClick={() => mark(active.id, "resolved")}
                    disabled={busy}
                    className="ui-btn"
                  >
                    Đánh dấu đã xử lý
                  </button>
                )}
              </header>

              <div className="ui-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {blocks.map((b, i) => {
                  const mine = b.author === "Bạn";
                  return (
                    <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                        style={
                          mine
                            ? { background: "var(--brand)", color: "var(--card)" }
                            : { background: "var(--surface-3)", color: "var(--ink-800)" }
                        }
                      >
                        {b.author && (
                          <div className={`mb-1 text-[10.5px] font-semibold ${mine ? "text-white/70" : ""}`} style={mine ? undefined : { color: "var(--ink-400)" }}>
                            {b.author}
                          </div>
                        )}
                        {b.text}
                      </div>
                    </div>
                  );
                })}

                {active.adminReply && (
                  <div className="flex justify-start">
                    <div className="max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px]" style={{ background: "var(--ok-bg)", color: "var(--ink-800)" }}>
                      <div className="mb-1 text-[10.5px] font-semibold" style={{ color: "var(--ok-ink)" }}>
                        Đội hỗ trợ
                      </div>
                      {active.adminReply}
                    </div>
                  </div>
                )}
              </div>

              <footer className="border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-end gap-2">
                  <textarea
                    className={input}
                    style={{ borderColor: "var(--line-strong)", minHeight: 44, maxHeight: 140 }}
                    rows={2}
                    placeholder="Nhập tin nhắn…"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                  />
                  <button type="button" onClick={sendReply} disabled={busy || !reply.trim()} className="ui-btn-primary disabled:opacity-50">
                    Gửi
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setComposerOpen(false)} />
          <div className="ui-card relative z-10 w-full max-w-[560px] p-5">
            <h2 className="ui-h2 mb-3">Cuộc trò chuyện mới</h2>
            <div className="space-y-3">
              <label className="block">
                <span className="ui-label mb-1 block">Loại yêu cầu</span>
                <select className={input} style={{ borderColor: "var(--line-strong)" }} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  <option value="support">Hỗ trợ</option>
                  <option value="bug">Báo lỗi</option>
                  <option value="feature">Đề xuất tính năng</option>
                </select>
              </label>
              <label className="block">
                <span className="ui-label mb-1 block">Tiêu đề *</span>
                <input
                  className={input}
                  style={{ borderColor: "var(--line-strong)" }}
                  value={draft.subject}
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  placeholder="VD: Không kéo được chỉ số TikTok"
                />
              </label>
              <label className="block">
                <span className="ui-label mb-1 block">Nội dung *</span>
                <textarea
                  className={input}
                  style={{ borderColor: "var(--line-strong)" }}
                  rows={5}
                  value={draft.message}
                  onChange={(e) => setDraft({ ...draft, message: e.target.value })}
                  placeholder="Mô tả càng rõ càng nhanh được hỗ trợ…"
                />
              </label>
              {msg && (
                <p className="text-[12.5px]" style={{ color: "var(--danger-ink)" }}>
                  {msg}
                </p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="ui-btn" onClick={() => setComposerOpen(false)}>
                Huỷ
              </button>
              <button type="button" className="ui-btn-primary" onClick={createThread} disabled={busy}>
                {busy ? "Đang gửi…" : "Gửi yêu cầu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function splitMessage(raw: string): { author: string | null; text: string }[] {
  return raw
    .split(/\n\n---\n/)
    .map((chunk) => {
      const m = chunk.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
      return m ? { author: m[1], text: m[2] } : { author: null, text: chunk };
    })
    .filter((b) => b.text.trim().length > 0);
}

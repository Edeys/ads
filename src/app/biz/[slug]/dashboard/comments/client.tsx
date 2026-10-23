"use client";

// Comment Manager — inbox comment FB + rule auto-reply + theo dõi page realtime.
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

type Sub = { id: string; pageId: string; pageName: string | null; status: string; lastEventAt: string | null; createdAt: string };
type Rule = {
  id: string; name: string; pageId: string | null; matchMode: string; keywords: string[];
  actions: { reply?: string; privateReply?: string; hide?: boolean; notifyTelegramConnId?: string; webhookN8n?: boolean };
  enabled: boolean; priority: number; hitCount: number;
};
type Comment = {
  id: string; pageId: string; postId: string; commentId: string; parentCommentId: string | null;
  authorName: string | null; authorId: string | null; message: string; hidden: boolean;
  verb: string; source: string; ruleAction: string | null; replyText: string | null;
  privateReplySent: boolean; createdAt: string;
};
type Post = { id: string; message?: string; created_time?: string };

const input = "w-full rounded-md border px-3 py-2 text-sm";
const btn = "rounded-md px-3 py-1.5 text-sm font-medium";

export function CommentsClient({
  slug, canManage, subscriptions, rules, telegramConns, metaConns,
}: {
  slug: string; canManage: boolean; subscriptions: Sub[]; rules: Rule[];
  telegramConns: { id: string; name: string }[];
  metaConns: { id: string; name: string; pages: { id: string; name: string }[] }[];
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [stats, setStats] = useState<{ total: number; hidden: number; replied: number; unprocessed: number } | null>(null);
  const [pageFilter, setPageFilter] = useState<string>("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [postFilter, setPostFilter] = useState<string>("");
  const [subOpen, setSubOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const loadComments = useCallback(async () => {
    const q = new URLSearchParams();
    if (pageFilter) q.set("pageId", pageFilter);
    if (postFilter) q.set("postId", postFilter);
    const r = await fetch(`/api/biz/${slug}/comments?${q}`).then((x) => x.json()).catch(() => null);
    if (r?.comments) { setComments(r.comments); setStats(r.stats); }
  }, [slug, pageFilter, postFilter]);

  useEffect(() => { loadComments(); }, [loadComments]);

  // tải danh sách post của page đang chọn (từ connection meta đầu tiên có page đó)
  useEffect(() => {
    setPosts([]); setPostFilter("");
    if (!pageFilter) return;
    const conn = metaConns.find((c) => c.pages.some((p) => p.id === pageFilter));
    if (!conn) return;
    fetch(`/api/biz/${slug}/page-posts?connectionId=${conn.id}&pageId=${pageFilter}&limit=15`)
      .then((r) => r.json()).then((r) => setPosts(r.posts ?? [])).catch(() => {});
  }, [pageFilter, slug, metaConns]);

  async function act(body: Record<string, unknown>) {
    setBusy(true); setNote("");
    const r = await fetch(`/api/biz/${slug}/comments`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then((x) => x.json()).catch(() => ({ error: "network" }));
    setBusy(false);
    setNote(r.error ? `❌ ${r.error}` : "✅ Đã thực hiện");
    await loadComments();
    return r;
  }

  const pagesWatched = subscriptions.map((s) => ({ id: s.pageId, name: s.pageName ?? s.pageId }));

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="ui-h1">Bình luận Facebook</h1>
        {canManage && (
          <div className="flex gap-2">
            <Dialog.Root open={subOpen} onOpenChange={setSubOpen}>
              <Dialog.Trigger className={`${btn} border bg-[var(--card)]`}>📡 Theo dõi Page</Dialog.Trigger>
              <SubscribeDialog slug={slug} metaConns={metaConns} onDone={() => { setSubOpen(false); location.reload(); }} />
            </Dialog.Root>
            <Dialog.Root open={ruleOpen} onOpenChange={setRuleOpen}>
              <Dialog.Trigger className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>+ Rule tự động</Dialog.Trigger>
              <RuleDialog slug={slug} pages={pagesWatched} telegramConns={telegramConns} onDone={() => { setRuleOpen(false); location.reload(); }} />
            </Dialog.Root>
          </div>
        )}
      </div>

      {subscriptions.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Chưa theo dõi page nào. Bấm <b>📡 Theo dõi Page</b> để bật nhận comment realtime qua Meta Webhook
          (cần Meta App đã cấu hình Callback URL <code>/api/webhooks/meta</code> và quyền <code>pages_manage_engagement</code>).
          Chưa có webhook vẫn dùng được: worker poll comment mỗi 60 giây.
        </div>
      )}

      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ["Tổng comment", stats.total], ["Đã trả lời", stats.replied],
            ["Đã ẩn", stats.hidden], ["Chờ xử lý", stats.unprocessed],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-lg border bg-[var(--card)] p-3">
              <div className="text-xs text-zinc-500">{l}</div>
              <div className="text-xl font-semibold">{v as number}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bộ lọc */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <select value={pageFilter} onChange={(e) => setPageFilter(e.target.value)} className="rounded-md border bg-[var(--card)] px-2 py-1.5">
          <option value="">Mọi page đang theo dõi</option>
          {pagesWatched.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {posts.length > 0 && (
          <select value={postFilter} onChange={(e) => setPostFilter(e.target.value)} className="max-w-md rounded-md border bg-[var(--card)] px-2 py-1.5">
            <option value="">Mọi bài viết</option>
            {posts.map((p) => <option key={p.id} value={p.id}>{(p.message ?? p.id).slice(0, 60)}</option>)}
          </select>
        )}
        <button onClick={loadComments} className={`${btn} border bg-[var(--card)]`}>↻ Làm mới</button>
        {note && <span className="text-xs text-zinc-600">{note}</span>}
      </div>

      {/* Bảng comment */}
      <div className="overflow-hidden rounded-lg border bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">Người comment</th>
              <th className="px-3 py-2">Nội dung</th>
              <th className="px-3 py-2">Bài</th>
              <th className="px-3 py-2">Rule</th>
              <th className="px-3 py-2 w-64">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {comments.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">Chưa có comment nào — bấm ↻ Làm mới hoặc chờ worker poll.</td></tr>
            )}
            {comments.map((c) => (
              <tr key={c.id} className={`border-b last:border-0 ${c.hidden ? "bg-zinc-50 text-zinc-400" : ""}`}>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium">{c.authorName ?? c.authorId ?? "Ẩn danh"}</div>
                  <div className="text-xs text-zinc-400">{new Date(c.createdAt).toLocaleString("vi-VN")} · {c.source}</div>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className={c.hidden ? "line-through" : ""}>{c.message}</div>
                  {c.replyText && <div className="mt-1 rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">↩ {c.replyText}</div>}
                  {c.privateReplySent && <div className="text-xs text-violet-600">✉ đã gửi tin riêng</div>}
                </td>
                <td className="px-3 py-2 align-top text-xs text-zinc-500">{c.postId}</td>
                <td className="px-3 py-2 align-top text-xs">
                  {c.ruleAction ? <span className="rounded bg-zinc-100 px-1.5 py-0.5">{c.ruleAction}</span> : "—"}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-wrap gap-1">
                    {canManage && (
                      <>
                        <ReplyButton busy={busy} onSend={(msg) => act({ action: "reply", pageId: c.pageId, commentId: c.commentId, parentCommentId: c.parentCommentId, postId: c.postId, message: msg })} />
                        <button disabled={busy} onClick={() => act({ action: c.hidden ? "unhide" : "hide", pageId: c.pageId, commentId: c.commentId })}
                          className="rounded border px-2 py-0.5 text-xs hover:bg-zinc-50">{c.hidden ? "Hiện" : "Ẩn"}</button>
                        <button disabled={busy} onClick={() => { if (confirm("Xoá comment này?")) act({ action: "delete", pageId: c.pageId, commentId: c.commentId }); }}
                          className="rounded border px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">Xoá</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rules */}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Rule tự động trả lời</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {rules.length === 0 && (
          <div className="rounded-lg border border-dashed bg-[var(--card)] p-6 text-center text-sm text-zinc-500 md:col-span-2">
            Chưa có rule. Ví dụ: keyword <b>"giá"</b> → trả lời "Vui lòng inbox để nhận bảng giá chi tiết ạ".
          </div>
        )}
        {rules.map((r) => (
          <div key={r.id} className="rounded-lg border bg-[var(--card)] p-4 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{r.name} {r.enabled ? "" : "(tắt)"}</span>
              {canManage && (
                <button onClick={async () => {
                  await fetch(`/api/biz/${slug}/comment-rules`, {
                    method: "PUT", headers: { "content-type": "application/json" },
                    body: JSON.stringify({ id: r.id, enabled: !r.enabled }),
                  });
                  location.reload();
                }} className="text-xs text-blue-600 hover:underline">{r.enabled ? "Tắt" : "Bật"}</button>
              )}
            </div>
            <div className="text-xs text-zinc-500">
              Khớp {r.matchMode === "all" ? "đủ" : "1"}: {r.keywords.join(", ")} · {r.pageId ?? "mọi page"} · chạy {r.hitCount} lần
            </div>
            <div className="mt-1 text-xs">
              {r.actions.reply && <span className="mr-2 rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">reply</span>}
              {r.actions.privateReply && <span className="mr-2 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">PM riêng</span>}
              {r.actions.hide && <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5">ẩn</span>}
              {r.actions.notifyTelegramConnId && <span className="mr-2 rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">Telegram</span>}
              {r.actions.webhookN8n && <span className="mr-2 rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">n8n</span>}
            </div>
            {canManage && (
              <button onClick={async () => {
                if (!confirm("Xoá rule này?")) return;
                await fetch(`/api/biz/${slug}/comment-rules?id=${r.id}`, { method: "DELETE" });
                location.reload();
              }} className="mt-2 text-xs text-red-600 hover:underline">Xoá rule</button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

function ReplyButton({ busy, onSend }: { busy: boolean; onSend: (message: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="rounded border px-2 py-0.5 text-xs hover:bg-zinc-50" disabled={busy}>Trả lời</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--card)] p-5 shadow-lg">
          <Dialog.Title className="mb-3 font-semibold">Trả lời comment</Dialog.Title>
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} className={input} placeholder="Nội dung trả lời công khai..." />
          <div className="mt-3 flex justify-end gap-2">
            <Dialog.Close className={`${btn} border`}>Huỷ</Dialog.Close>
            <button disabled={!msg.trim() || busy} onClick={async () => { await onSend(msg.trim()); setOpen(false); }}
              className={`${btn} bg-blue-600 text-white`}>Gửi</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SubscribeDialog({ slug, metaConns, onDone }: { slug: string; metaConns: { id: string; name: string; pages: { id: string; name: string }[] }[]; onDone: () => void }) {
  const [connId, setConnId] = useState(metaConns[0]?.id ?? "");
  const [pageId, setPageId] = useState("");
  const [err, setErr] = useState("");
  const pages = metaConns.find((c) => c.id === connId)?.pages ?? [];

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/30" />
      <Dialog.Content className="fixed left-1/2 top-1/2 w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--card)] p-5 shadow-lg">
        <Dialog.Title className="mb-1 font-semibold">Theo dõi Page (webhook realtime)</Dialog.Title>
        <Dialog.Description className="mb-3 text-xs text-zinc-500">
          Bật nhận comment + bài mới theo thời gian thực qua Meta Page Webhooks (field <code>feed</code>).
        </Dialog.Description>
        <div className="space-y-2">
          <select value={connId} onChange={(e) => { setConnId(e.target.value); setPageId(""); }} className={input}>
            {metaConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={pageId} onChange={(e) => setPageId(e.target.value)} className={input}>
            <option value="">— Chọn page —</option>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {err && <div className="text-xs text-red-600">{err}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Dialog.Close className={`${btn} border`}>Huỷ</Dialog.Close>
          <button disabled={!pageId} onClick={async () => {
            const page = pages.find((p) => p.id === pageId);
            const r = await fetch(`/api/biz/${slug}/page-subscriptions`, {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ connectionId: connId, pageId, pageName: page?.name }),
            }).then((x) => x.json());
            if (r.error) setErr(r.error);
            else onDone();
          }} className={`${btn} bg-blue-600 text-white`}>Theo dõi</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

function RuleDialog({ slug, pages, telegramConns, onDone }: {
  slug: string;
  pages: { id: string; name: string }[];
  telegramConns: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState("any");
  const [reply, setReply] = useState("");
  const [privateReply, setPrivateReply] = useState("");
  const [hide, setHide] = useState(false);
  const [tgConn, setTgConn] = useState("");
  const [n8n, setN8n] = useState(true);
  const [err, setErr] = useState("");

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/30" />
      <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[90vh] w-[34rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-[var(--card)] p-5 shadow-lg">
        <Dialog.Title className="mb-3 font-semibold">Rule tự động trả lời comment</Dialog.Title>
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Tên rule, vd: Hỏi giá → trả lời bảng giá" />
          <div className="flex gap-2">
            <select value={pageId} onChange={(e) => setPageId(e.target.value)} className={input}>
              <option value="">Mọi page</option>
              {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={matchMode} onChange={(e) => setMatchMode(e.target.value)} className={input}>
              <option value="any">Khớp 1 từ khoá</option>
              <option value="all">Khớp đủ tất cả</option>
            </select>
          </div>
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} className={input} placeholder="Từ khoá, phân cách bằng dấu phẩy — vd: giá, bao nhiêu tiền" />
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} className={input} placeholder="Trả lời công khai (tuỳ chọn)" />
          <textarea value={privateReply} onChange={(e) => setPrivateReply(e.target.value)} rows={2} className={input} placeholder="Nhắn tin riêng cho người comment (tuỳ chọn — pages_messaging)" />
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Ẩn comment</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={n8n} onChange={(e) => setN8n(e.target.checked)} /> Bắn event n8n</label>
            {telegramConns.length > 0 && (
              <select value={tgConn} onChange={(e) => setTgConn(e.target.value)} className="rounded-md border px-2 py-1 text-xs">
                <option value="">Không báo Telegram</option>
                {telegramConns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          {err && <div className="text-xs text-red-600">{err}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Dialog.Close className={`${btn} border`}>Huỷ</Dialog.Close>
          <button disabled={!name.trim() || !keywords.trim()} onClick={async () => {
            const r = await fetch(`/api/biz/${slug}/comment-rules`, {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name, pageId, matchMode,
                keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean),
                actions: {
                  ...(reply.trim() ? { reply: reply.trim() } : {}),
                  ...(privateReply.trim() ? { privateReply: privateReply.trim() } : {}),
                  ...(hide ? { hide: true } : {}),
                  ...(tgConn ? { notifyTelegramConnId: tgConn } : {}),
                  ...(n8n ? { webhookN8n: true } : {}),
                },
              }),
            }).then((x) => x.json());
            if (r.error) setErr(r.error);
            else onDone();
          }} className={`${btn} bg-blue-600 text-white`}>Tạo rule</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

"use client";

// Publisher — soạn bài (AI viết content + soát chính sách), đăng ngay / lên lịch / draft,
// lịch đăng bài tự động (worker publish đến giờ).
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

type Post = {
  id: string; pageId: string; message: string; linkUrl: string | null; photos: string[];
  videoUrl: string | null; mode: string; status: string; scheduledAt: string | null;
  publishedAt: string | null; postId: string | null; publishError: string | null;
  aiPolicyCheck: { ok: boolean; reason?: string } | null; createdAt: string;
};

const input = "w-full rounded-md border px-3 py-2 text-sm";
const btn = "rounded-md px-3 py-1.5 text-sm font-medium";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600", scheduled: "bg-amber-50 text-amber-700",
  publishing: "bg-sky-50 text-sky-700", published: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700", cancelled: "bg-zinc-100 text-zinc-400",
};

function localIso(minDeltaMin: number) {
  const d = new Date(Date.now() + minDeltaMin * 60_000);
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function PublisherClient({
  slug, canManage, pages, aiProviders, posts,
}: {
  slug: string; canManage: boolean;
  pages: { connectionId: string; id: string; name: string }[];
  aiProviders: { id: string; name: string; provider: string }[];
  posts: Post[];
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  async function act(body: Record<string, unknown>) {
    const r = await fetch(`/api/biz/${slug}/publisher`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then((x) => x.json()).catch(() => ({ error: "network" }));
    setNote(r.error ? `❌ ${r.error}` : "✅ Đã cập nhật");
    setTimeout(() => location.reload(), 800);
    return r;
  }

  const scheduled = posts.filter((p) => p.status === "scheduled");
  const drafts = posts.filter((p) => p.status === "draft");
  const done = posts.filter((p) => ["published", "failed", "cancelled"].includes(p.status));

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="ui-h1">Đăng bài tự động</h1>
        {canManage && pages.length > 0 && (
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>+ Soạn bài</Dialog.Trigger>
            <Composer slug={slug} pages={pages} aiProviders={aiProviders} onDone={() => { setOpen(false); setTimeout(() => location.reload(), 600); }} />
          </Dialog.Root>
        )}
        {note && <span className="text-sm text-zinc-600">{note}</span>}
      </div>

      {pages.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Chưa có Page nào khả dụng. Kết nối Meta Ads (đã gồm quyền <code>pages_manage_posts</code>) ở trang Kết nối trước.
        </div>
      )}

      {/* Đang chờ đăng */}
      <h2 className="mb-2 text-lg font-semibold">Lịch đăng ({scheduled.length})</h2>
      <div className="mb-6 grid gap-2 md:grid-cols-2">
        {scheduled.length === 0 && <div className="rounded-lg border border-dashed bg-[var(--card)] p-6 text-center text-sm text-zinc-500 md:col-span-2">Chưa có bài nào chờ đăng.</div>}
        {scheduled.map((p) => (
          <div key={p.id} className="rounded-lg border bg-[var(--card)] p-4 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[p.status]}`}>⏰ {new Date(p.scheduledAt!).toLocaleString("vi-VN")}</span>
              <div className="flex gap-2 text-xs">
                {canManage && <>
                  <button onClick={() => act({ id: p.id, action: "publish_now" })} className="text-emerald-700 hover:underline">Đăng ngay</button>
                  <button onClick={() => act({ id: p.id, action: "cancel" })} className="text-red-600 hover:underline">Huỷ</button>
                </>}
              </div>
            </div>
            <div className="whitespace-pre-wrap">{p.message.slice(0, 240)}{(p.message.length ?? 0) > 240 ? "…" : ""}</div>
            <div className="mt-1 text-xs text-zinc-400">{p.photos.length} ảnh · page {p.pageId}</div>
          </div>
        ))}
      </div>

      {/* Draft */}
      {drafts.length > 0 && (
        <>
          <h2 className="mb-2 text-lg font-semibold">Bản nháp ({drafts.length})</h2>
          <div className="mb-6 grid gap-2 md:grid-cols-2">
            {drafts.map((p) => (
              <div key={p.id} className="rounded-lg border bg-[var(--card)] p-4 text-sm">
                <div className="mb-1 flex items-center justify-between">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[p.status]}`}>
                    nháp{p.aiPolicyCheck && !p.aiPolicyCheck.ok ? " · AI chặn" : ""}
                  </span>
                  {canManage && <div className="flex gap-2 text-xs">
                    <button onClick={() => act({ id: p.id, action: "publish_now" })} className="text-emerald-700 hover:underline">Đăng ngay</button>
                    <button onClick={async () => {
                      const at = prompt("Đăng lúc (yyyy-MM-ddTHH:mm, tối thiểu 10 phút nữa):", localIso(15));
                      if (at) await act({ id: p.id, action: "reschedule", scheduledAt: at });
                    }} className="text-blue-600 hover:underline">Lên lịch</button>
                  </div>}
                </div>
                {p.aiPolicyCheck && !p.aiPolicyCheck.ok && (
                  <div className="mb-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">AI: {p.aiPolicyCheck.reason}</div>
                )}
                <div className="whitespace-pre-wrap">{p.message.slice(0, 200)}…</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Lịch sử */}
      <h2 className="mb-2 text-lg font-semibold">Lịch sử</h2>
      <div className="overflow-hidden rounded-lg border bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-zinc-500">
            <tr><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2">Nội dung</th><th className="px-3 py-2">Thời gian</th><th className="px-3 py-2">Post ID</th></tr>
          </thead>
          <tbody>
            {done.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">Trống.</td></tr>}
            {done.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[p.status]}`}>{p.status}</span></td>
                <td className="max-w-md px-3 py-2">{p.message.slice(0, 80)}… {p.publishError && <div className="text-xs text-red-600">{p.publishError}</div>}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{p.publishedAt ? new Date(p.publishedAt).toLocaleString("vi-VN") : "—"}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{p.postId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Composer({ slug, pages, aiProviders, onDone }: {
  slug: string;
  pages: { connectionId: string; id: string; name: string }[];
  aiProviders: { id: string; name: string; provider: string }[];
  onDone: () => void;
}) {
  const [pageId, setPageId] = useState(pages[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [photos, setPhotos] = useState(""); // mỗi dòng 1 URL
  const [videoUrl, setVideoUrl] = useState("");
  const [mode, setMode] = useState("schedule");
  const [scheduledAt, setScheduledAt] = useState(localIso(30));
  const [aiConnId, setAiConnId] = useState(aiProviders[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [aiNote, setAiNote] = useState("");

  const conn = pages.find((p) => p.id === pageId)?.connectionId ?? pages[0]?.connectionId;

  async function aiWrite() {
    if (!aiConnId || !brief.trim()) return;
    setBusy(true); setAiNote("AI đang viết...");
    const r = await fetch(`/api/biz/${slug}/publisher`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "ai_write", aiConnId, brief: brief.trim() }),
    }).then((x) => x.json());
    setBusy(false);
    if (r.content) { setMessage(r.content); setAiNote("✅ AI đã viết xong — chỉnh thêm rồi đăng"); }
    else setAiNote(`❌ ${r.error ?? "AI lỗi"}`);
  }

  async function submit(force = false) {
    setErr(""); setBusy(true);
    const r = await fetch(`/api/biz/${slug}/publisher`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connectionId: conn, pageId, message,
        linkUrl: linkUrl.trim() || undefined,
        photos: photos.split("\n").map((s) => s.trim()).filter(Boolean),
        videoUrl: videoUrl.trim() || undefined,
        mode, scheduledAt: mode === "schedule" ? new Date(scheduledAt).toISOString() : undefined,
        aiConnId: aiConnId || undefined,
        force,
      }),
    }).then((x) => x.json());
    setBusy(false);
    if (r.blocked) {
      if (confirm(`AI chặn vì: ${r.reason}\n\nLưu thành bản nháp để sửa sau?`)) onDone();
      return;
    }
    if (r.error) setErr(r.error);
    else onDone();
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/30" />
      <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[92vh] w-[40rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-[var(--card)] p-5 shadow-lg">
        <Dialog.Title className="mb-3 font-semibold">Soạn bài đăng Fanpage</Dialog.Title>

        <div className="space-y-2">
          <select value={pageId} onChange={(e) => setPageId(e.target.value)} className={input}>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {aiProviders.length > 0 && (
            <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
              <div className="mb-1 text-xs font-medium text-violet-800">✍️ AI viết content</div>
              <div className="flex gap-2">
                <select value={aiConnId} onChange={(e) => setAiConnId(e.target.value)} className="rounded-md border px-2 py-1 text-xs">
                  {aiProviders.map((a) => <option key={a.id} value={a.id}>{a.provider} — {a.name}</option>)}
                </select>
                <button onClick={aiWrite} disabled={busy || !brief.trim()} className={`${btn} bg-violet-600 text-xs text-white`}>Viết hộ tôi</button>
              </div>
              <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} className={`${input} mt-2 text-xs`}
                placeholder="Brief: sản phẩm/giá/ưu đãi/đối tượng... vd: Bán đất 1ha2 cà phê sầu riêng Đắk Nia, 4,9 tỷ, gần QL28, sổ sẵn" />
              {aiNote && <div className="mt-1 text-xs text-violet-700">{aiNote}</div>}
            </div>
          )}

          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} className={input} placeholder="Nội dung bài viết..." />
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className={input} placeholder="Link đính kèm (tuỳ chọn)" />
          <textarea value={photos} onChange={(e) => setPhotos(e.target.value)} rows={2} className={input} placeholder="URL ảnh công khai, mỗi dòng 1 ảnh (tối đa 10) — trống nếu không có" />
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={input} placeholder="URL video công khai (tuỳ chọn)" />

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {["now", "schedule", "draft"].map((m) => (
              <label key={m} className="flex items-center gap-1">
                <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
                {m === "now" ? "Đăng ngay" : m === "schedule" ? "Lên lịch" : "Lưu nháp"}
              </label>
            ))}
            {mode === "schedule" && (
              <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-md border px-2 py-1 text-sm" />
            )}
          </div>

          {aiConnId && <div className="text-xs text-zinc-500">🛡️ AI sẽ soát chính sách nội dung trước khi đăng (đặt chặn → lưu nháp).</div>}
          {err && <div className="text-xs text-red-600">{err}</div>}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Dialog.Close className={`${btn} border`}>Huỷ</Dialog.Close>
          <button disabled={!message.trim() || !pageId || busy} onClick={() => submit(false)}
            className={`${btn} bg-blue-600 text-white`}>
            {mode === "now" ? "Đăng ngay" : mode === "schedule" ? "Lên lịch" : "Lưu nháp"}
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

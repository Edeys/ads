"use client";

// Publisher — soạn bài (AI viết content + soát chính sách), đăng ngay / lên lịch / draft,
// lịch đăng bài tự động (worker publish đến giờ).
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

type Target = {
  id: string; type: string; refId: string; label: string | null;
  status: string; postId: string | null; error: string | null;
};

type Post = {
  id: string; pageId: string | null; message: string; linkUrl: string | null; photos: string[];
  videoUrl: string | null; mode: string; status: string; scheduledAt: string | null;
  publishedAt: string | null; postId: string | null; publishError: string | null;
  aiPolicyCheck: { ok: boolean; reason?: string } | null; createdAt: string;
  targets?: Target[];
};

const input = "w-full rounded-md border px-3 py-2 text-sm";
const btn = "rounded-md px-3 py-1.5 text-sm font-medium";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600", scheduled: "bg-amber-50 text-amber-700",
  publishing: "bg-sky-50 text-sky-700", published: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-800", failed: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-400",
};

const TARGET_BADGE: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-500", publishing: "bg-sky-50 text-sky-700",
  published: "bg-emerald-50 text-emerald-700", failed: "bg-red-50 text-red-700",
  cancelled: "bg-zinc-100 text-zinc-400",
};

const NET_ICON: Record<string, string> = {
  meta_page: "📘", instagram: "📷", x_twitter: "🐦", linkedin: "💼",
  tiktok: "🎵", threads: "🧵", pinterest: "📌", cms_wordpress: "🌐", cms_webhook: "🔗",
};

/** Chip trạng thái từng đích — đích lỗi hiện tooltip lý do. */
function TargetChips({ targets }: { targets?: Target[] }) {
  if (!targets?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {targets.map((t) => (
        <span key={t.id} title={t.error ?? undefined}
          className={`rounded px-1.5 py-0.5 text-[11px] ${TARGET_BADGE[t.status] ?? "bg-zinc-100 text-zinc-500"}`}>
          {NET_ICON[t.type] ?? "🔗"} {t.label ?? t.refId}
          {t.status === "failed" ? " ⚠" : t.status === "published" ? " ✓" : ""}
        </span>
      ))}
    </div>
  );
}

function localIso(minDeltaMin: number) {
  const d = new Date(Date.now() + minDeltaMin * 60_000);
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function PublisherClient({
  slug, canManage, destinations, aiProviders, posts,
}: {
  slug: string; canManage: boolean;
  destinations: { type: string; connectionId: string; refId: string; label: string; name: string }[];
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
        {canManage && destinations.length > 0 && (
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>+ Soạn bài</Dialog.Trigger>
            <Composer slug={slug} destinations={destinations} aiProviders={aiProviders} onDone={() => { setOpen(false); setTimeout(() => location.reload(), 600); }} />
          </Dialog.Root>
        )}
        {note && <span className="text-sm text-zinc-600">{note}</span>}
      </div>

      {destinations.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Chưa có đích nào khả dụng. Kết nối Meta Ads (đã gồm quyền <code>pages_manage_posts</code>) hoặc các mạng xã hội khác ở trang Kết nối trước.
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
            <TargetChips targets={p.targets} />
            {p.targets && p.targets.length > 0 ? (
              <div className="mt-1 text-xs text-zinc-400">{p.photos.length} ảnh · {p.targets.length} đích</div>
            ) : (
              <div className="mt-1 text-xs text-zinc-400">{p.photos.length} ảnh · page {p.pageId ?? "?"}</div>
            )}
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
                <TargetChips targets={p.targets} />
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
                <td className="max-w-md px-3 py-2">{p.message.slice(0, 80)}… {p.publishError && <div className="text-xs text-red-600">{p.publishError}</div>}
                  <TargetChips targets={p.targets} />
                </td>
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

function Composer({ slug, destinations, aiProviders, onDone }: {
  slug: string;
  destinations: { type: string; connectionId: string; refId: string; label: string; name: string }[];
  aiProviders: { id: string; name: string; provider: string }[];
  onDone: () => void;
}) {
  // key duy nhất của một đích = type + connectionId + refId.
  const destKey = (d: typeof destinations[number]) => `${d.type}|${d.connectionId}|${d.refId}`;
  const [selKeys, setSelKeys] = useState<string[]>(destinations[0] ? [destKey(destinations[0])] : []);
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

  function toggleDest(key: string) {
    setSelKeys((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : prev.length >= 10 ? prev : [...prev, key],
    );
  }

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
    const targets = destinations
      .filter((d) => selKeys.includes(destKey(d)))
      .map((d) => ({ type: d.type, refId: d.refId, connectionId: d.connectionId, label: d.label }));
    const r = await fetch(`/api/biz/${slug}/publisher`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targets, message,
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
    if (r.error) { setErr(r.error); return; }
    // Đăng ngay: báo kết quả TỪNG đích, đích lỗi hiện rõ rồi mới đóng.
    if (Array.isArray(r.results) && r.results.some((x: any) => !x.ok)) {
      setErr(`Một số đích lỗi:\n${r.results.filter((x: any) => !x.ok).map((x: any) => `• ${x.label ?? x.refId}: ${x.error}`).join("\n")}`);
      return;
    }
    onDone();
  }

  // Nhóm đích theo mạng để dễ chọn.
  const byNet = new Map<string, typeof destinations>();
  for (const d of destinations) {
    const list = byNet.get(d.type) ?? [];
    list.push(d);
    byNet.set(d.type, list);
  }
  const netLabel: Record<string, string> = {
    meta_page: "Facebook Page", instagram: "Instagram", x_twitter: "X (Twitter)", linkedin: "LinkedIn",
    tiktok: "TikTok", threads: "Threads", pinterest: "Pinterest (board)",
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/30" />
      <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[92vh] w-[40rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-[var(--card)] p-5 shadow-lg">
        <Dialog.Title className="mb-3 font-semibold">Soạn bài đăng — chọn nhiều đích</Dialog.Title>

        <div className="space-y-2">
          <div className="rounded-md border border-zinc-200 p-2">
            <div className="mb-1 text-xs font-medium text-zinc-500">
              Đăng tới {selKeys.length}/{destinations.length} đích {selKeys.length >= 10 && "(tối đa 10)"}
            </div>
            <div className="grid max-h-52 gap-1 overflow-y-auto md:grid-cols-2">
              {[...byNet.entries()].map(([net, list]) => (
                <div key={net} className="md:col-span-2">
                  <div className="px-1.5 pt-1 text-[11px] font-semibold uppercase text-zinc-400">
                    {netLabel[net] ?? net} ({list.length})
                  </div>
                  {list.map((d) => {
                    const key = destKey(d);
                    return (
                      <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-zinc-50">
                        <input type="checkbox" checked={selKeys.includes(key)} onChange={() => toggleDest(key)} />
                        <span className="truncate">{NET_ICON[net] ?? "🔗"} {d.name}</span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

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
          <button disabled={!message.trim() || selKeys.length === 0 || busy} onClick={() => submit(false)}
            className={`${btn} bg-blue-600 text-white`}>
            {mode === "now" ? `Đăng ngay (${selKeys.length} đích)` : mode === "schedule" ? `Lên lịch (${selKeys.length} đích)` : "Lưu nháp"}
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

"use client";

// n8n Integration — cấu hình outbound webhook (n8n Webhook node), test, log,
// và hướng dẫn nối 2 chiều: app → n8n (webhook) và n8n → app (HTTP Request / MCP Client).
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

type Hook = {
  id: string; name: string; url: string; secret: string | null; events: string[];
  enabled: boolean; lastStatus: string | null; lastError: string | null; lastFiredAt: string | null;
};
type Log = { id: string; webhookId: string | null; event: string; ok: boolean; statusCode: number | null; latencyMs: number | null; createdAt: string };

const EVENT_CATALOG = [
  { event: "comment.received", label: "Comment mới trên page" },
  { event: "comment.replied", label: "Đã trả lời comment" },
  { event: "comment.matched", label: "Comment khớp rule auto-reply" },
  { event: "post.published", label: "Bài đăng đã publish (tự động/thủ công/webhook)" },
  { event: "post.publish_failed", label: "Đăng bài thất bại" },
  { event: "campaign.paused", label: "Autopilot tắt chiến dịch" },
  { event: "whitelist.violation", label: "Vi phạm page whitelist" },
  { event: "connection.expiring", label: "Token kết nối sắp hết hạn" },
];

const input = "w-full rounded-md border px-3 py-2 text-sm";
const btn = "rounded-md px-3 py-1.5 text-sm font-medium";

export function N8nClient({ slug, canManage, webhooks, logs, appUrl }: {
  slug: string; canManage: boolean; webhooks: Hook[]; logs: Log[]; appUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  async function test(id: string) {
    setNote("Đang bắn test event...");
    const r = await fetch(`/api/biz/${slug}/events`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "test", id, event: "comment.received" }),
    }).then((x) => x.json());
    setNote(`Đã gửi tới ${r.deliveredTo} webhook — xem log dưới để biết n8n trả lời gì.`);
    setTimeout(() => location.reload(), 1200);
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="ui-h1">n8n & Webhooks</h1>
        {canManage && (
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>+ Thêm webhook n8n</Dialog.Trigger>
            <AddHook slug={slug} onDone={() => { setOpen(false); location.reload(); }} />
          </Dialog.Root>
        )}
      </div>
      {note && <div className="mb-3 text-sm text-zinc-600">{note}</div>}

      {/* Webhook list */}
      <div className="mb-8 grid gap-2 md:grid-cols-2">
        {webhooks.length === 0 && (
          <div className="rounded-lg border border-dashed bg-[var(--card)] p-6 text-center text-sm text-zinc-500 md:col-span-2">
            Chưa có webhook nào. Trong n8n: thêm node <b>Webhook</b> (POST), copy Production URL rồi dán vào đây.
          </div>
        )}
        {webhooks.map((h) => (
          <div key={h.id} className="rounded-lg border bg-[var(--card)] p-4 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{h.name} {h.enabled ? "" : "(tắt)"}</span>
              <div className="flex gap-2 text-xs">
                {canManage && <>
                  <button onClick={() => test(h.id)} className="text-blue-600 hover:underline">Test</button>
                  <button onClick={async () => {
                    await fetch(`/api/biz/${slug}/events`, {
                      method: "PUT", headers: { "content-type": "application/json" },
                      body: JSON.stringify({ id: h.id, enabled: !h.enabled }),
                    });
                    location.reload();
                  }} className="text-zinc-600 hover:underline">{h.enabled ? "Tắt" : "Bật"}</button>
                  <button onClick={async () => {
                    if (!confirm("Xoá webhook này?")) return;
                    await fetch(`/api/biz/${slug}/events?id=${h.id}`, { method: "DELETE" });
                    location.reload();
                  }} className="text-red-600 hover:underline">Xoá</button>
                </>}
              </div>
            </div>
            <div className="break-all text-xs text-zinc-500">{h.url}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {h.events.map((e) => <span key={e} className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">{e}</span>)}
            </div>
            <div className="mt-1 text-xs">
              {h.lastStatus === "ok" && <span className="text-emerald-600">✓ lần cuối OK · {h.lastFiredAt ? new Date(h.lastFiredAt).toLocaleString("vi-VN") : ""}</span>}
              {h.lastStatus === "error" && <span className="text-red-600">✗ {h.lastError}</span>}
              {!h.lastStatus && <span className="text-zinc-400">chưa gọi lần nào</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Hướng dẫn 2 chiều */}
      <h2 className="mb-2 text-lg font-semibold">Nối n8n với AdsSync</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-[var(--card)] p-4 text-sm">
          <div className="mb-1 font-medium">1️⃣ AdsSync → n8n (outbound events)</div>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-600">
            <li>Trong n8n, thêm node <b>Webhook</b> (method POST), bật workflow, copy <b>Production URL</b>.</li>
            <li>Dán URL vào form "Thêm webhook n8n" ở trên, chọn event cần nhận (comment, post, campaign...).</li>
            <li>Bấm <b>Test</b> để xác nhận n8n nhận được payload <code>{`{event, bizId, ts, data}`}</code>.</li>
            <li>Optional: điền secret — mỗi request mang header <code>x-adssync-secret</code> để n8n xác thực.</li>
          </ol>
        </div>
        <div className="rounded-lg border bg-[var(--card)] p-4 text-sm">
          <div className="mb-1 font-medium">2️⃣ n8n → AdsSync (inbound)</div>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-600">
            <li>Dùng node <b>HTTP Request</b> gọi REST API của app: <code>{appUrl}/api/biz/{"{slug}"}/...</code> (kèm session cookie).</li>
            <li>Hoặc dùng <b>MCP Client Tool</b> trỏ tới MCP Server của app: <code>{appUrl}/mcp</code> — AI trong n8n gọi được 20+ tool (đọc chỉ số, comment, đăng bài...) với approval gate cho thao tác ghi.</li>
            <li>Workflow mẫu: Webhook nhận <code>comment.received</code> → AI phân loại lead → MCP <code>meta_reply_comment</code> → ghi Google Sheets.</li>
          </ol>
        </div>
      </div>

      {/* Event catalog */}
      <h2 className="mb-2 mt-6 text-lg font-semibold">Danh mục sự kiện phát ra</h2>
      <div className="overflow-hidden rounded-lg border bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-zinc-500">
            <tr><th className="px-3 py-2">Event</th><th className="px-3 py-2">Ý nghĩa</th></tr>
          </thead>
          <tbody>
            {EVENT_CATALOG.map((c) => (
              <tr key={c.event} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{c.event}</td>
                <td className="px-3 py-2">{c.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delivery log */}
      <h2 className="mb-2 mt-6 text-lg font-semibold">Log gửi sự kiện (30 gần nhất)</h2>
      <div className="overflow-hidden rounded-lg border bg-[var(--card)]">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left text-xs text-zinc-500">
            <tr><th className="px-3 py-2">Thời gian</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Kết quả</th><th className="px-3 py-2">Latency</th></tr>
          </thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-zinc-500">Chưa có log.</td></tr>}
            {logs.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-3 py-2 text-xs text-zinc-500">{new Date(l.createdAt).toLocaleString("vi-VN")}</td>
                <td className="px-3 py-2 font-mono text-xs">{l.event}</td>
                <td className="px-3 py-2 text-xs">{l.ok ? <span className="text-emerald-600">HTTP {l.statusCode}</span> : <span className="text-red-600">HTTP {l.statusCode ?? "err"}</span>}</td>
                <td className="px-3 py-2 text-xs text-zinc-500">{l.latencyMs}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function AddHook({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["comment.received"]);
  const [err, setErr] = useState("");

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/30" />
      <Dialog.Content className="fixed left-1/2 top-1/2 max-h-[90vh] w-[34rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-[var(--card)] p-5 shadow-lg">
        <Dialog.Title className="mb-1 font-semibold">Thêm webhook n8n</Dialog.Title>
        <Dialog.Description className="mb-3 text-xs text-zinc-500">
          Dán Production URL của node Webhook trong n8n (vd <code>https://n8n.cua-ban.vn/webhook/abc123</code>).
        </Dialog.Description>
        <div className="space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Tên gợi nhớ, vd: n8n chăm comment" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={input} placeholder="https://<n8n-host>/webhook/<path>" />
          <input value={secret} onChange={(e) => setSecret(e.target.value)} className={input} placeholder="Secret (tuỳ chọn) — header x-adssync-secret" />
          <div className="grid grid-cols-2 gap-1 text-sm">
            {EVENT_CATALOG.map((c) => (
              <label key={c.event} className="flex items-start gap-1.5 text-xs">
                <input type="checkbox" checked={events.includes(c.event)} onChange={(e) =>
                  setEvents((prev) => e.target.checked ? [...prev, c.event] : prev.filter((x) => x !== c.event))} />
                <span><span className="font-mono">{c.event}</span><br /><span className="text-zinc-500">{c.label}</span></span>
              </label>
            ))}
          </div>
          {err && <div className="text-xs text-red-600">{err}</div>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Dialog.Close className={`${btn} border`}>Huỷ</Dialog.Close>
          <button disabled={!name.trim() || !url.trim() || events.length === 0} onClick={async () => {
            const r = await fetch(`/api/biz/${slug}/events`, {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, url, secret: secret || undefined, events }),
            }).then((x) => x.json());
            if (r.error) setErr(r.error);
            else onDone();
          }} className={`${btn} bg-blue-600 text-white`}>Lưu webhook</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

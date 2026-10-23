"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Conn = { id: string; provider: string; name: string; meta: Record<string, unknown> };
type Tpl = { id: string; name: string; objective: string; destination: string; dailyBudget: number; isDefault: boolean };
const input = "w-full rounded-md border px-3 py-2 text-sm";

export function TriggerWizard({ slug, connections, templates }: { slug: string; connections: Conn[]; templates: Tpl[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [credentialId, setCredentialId] = useState("");
  const [pageId, setPageId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [keywords, setKeywords] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [notifyConnId, setNotifyConnId] = useState("");
  const [aiConnId, setAiConnId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const metaConns = connections.filter((c) => c.provider === "meta_ads");
  const tgConns = connections.filter((c) => c.provider === "telegram");
  const aiConns = connections.filter((c) => ["gemini", "openai", "anthropic", "deepseek", "openai_compatible"].includes(c.provider));
  const conn = metaConns.find((c) => c.id === credentialId);
  const pages = (conn?.meta?.pages as { id: string; name: string }[] | undefined) ?? [];
  const adAccounts = (conn?.meta?.adAccounts as { id: string; name: string }[] | undefined) ?? [];

  async function save() {
    setSaving(true); setError("");
    const res = await fetch(`/api/biz/${slug}/configs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "post_trigger", provider: "facebook",
        name: name || `Post trigger — ${pages.find((p) => p.id === pageId)?.name ?? pageId}`,
        credentialId, intervalMinutes: 10,
        params: {
          adAccountId, pageId, templateId,
          keywords: keywords.split("\n").map((s) => s.trim()).filter(Boolean),
          hashtags: hashtags.split("\n").map((s) => s.trim().replace(/^#/, "")).filter(Boolean),
          notifyConnId, aiConnId: aiConnId || undefined,
        },
      }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Lỗi"); return; }
    router.push(`/biz/${slug}/dashboard/configs`);
  }

  const steps = ["Tài khoản & Fanpage", "Mẫu quảng cáo", "Từ khoá/Hashtag", "Thông báo"];

  return (
    <main className="px-[18px] pb-10 pt-6">
      <h1 className="ui-h1 mb-6">Tự động chạy ads khi có bài mới</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border bg-[var(--card)] p-6">
          <div className="mb-6 flex gap-2">
            {steps.map((t, i) => (
              <div key={t} className={`flex-1 rounded-md px-2 py-2 text-center text-xs ${i === step ? "bg-blue-600 text-white" : i < step ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"}`}>{i + 1}. {t}</div>
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-3">
              {metaConns.map((c) => (
                <button key={c.id} onClick={() => { setCredentialId(c.id); setPageId(""); setAdAccountId(""); }}
                  className={`block w-full rounded-lg border p-4 text-left ${credentialId === c.id ? "border-blue-600 bg-blue-50" : "hover:border-blue-300"}`}>
                  <div className="font-medium">{c.name}</div>
                </button>
              ))}
              {credentialId && (
                <>
                  <label className="block text-sm"><span className="mb-1 block text-zinc-600">Fanpage theo dõi *</span>
                    <select className={input} value={pageId} onChange={(e) => setPageId(e.target.value)}>
                      <option value="">— chọn page —</option>
                      {pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm"><span className="mb-1 block text-zinc-600">TKQC *</span>
                    <select className={input} value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)}>
                      <option value="">— chọn —</option>
                      {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                    </select>
                  </label>
                </>
              )}
              <button disabled={!pageId || !adAccountId} onClick={() => setStep(1)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Tiếp →</button>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="grid gap-2 md:grid-cols-2">
                {templates.map((t) => (
                  <button key={t.id} onClick={() => setTemplateId(t.id)}
                    className={`rounded-lg border p-4 text-left ${templateId === t.id ? "border-blue-600 bg-blue-50" : "hover:border-blue-300"}`}>
                    <div className="font-medium">{t.name}{t.isDefault && <span className="ml-1 text-xs text-zinc-400">(mặc định)</span>}</div>
                    <div className="mt-1 text-xs text-zinc-500">{t.objective} · {t.destination} · {t.dailyBudget.toLocaleString("vi-VN")}₫/ngày</div>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setStep(0)} className="rounded-md border px-4 py-2 text-sm">← Lùi</button>
                <button disabled={!templateId} onClick={() => setStep(2)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Tiếp →</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="mb-3 block text-sm"><span className="mb-1 block text-zinc-600">Từ khoá (mỗi dòng 1 từ)</span>
                <textarea rows={4} className={input} value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder={"khuyến mãi\ngiảm giá\nfreeship"} />
              </label>
              <label className="mb-4 block text-sm"><span className="mb-1 block text-zinc-600">Hashtag (mỗi dòng 1 tag)</span>
                <textarea rows={3} className={input} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder={"#sale\n#flashsale"} />
              </label>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="rounded-md border px-4 py-2 text-sm">← Lùi</button>
                <button disabled={!keywords.trim() && !hashtags.trim()} onClick={() => setStep(3)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Tiếp →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <label className="block text-sm"><span className="mb-1 block text-zinc-600">Telegram thông báo *</span>
                <select className={input} value={notifyConnId} onChange={(e) => setNotifyConnId(e.target.value)}>
                  <option value="">— chọn bot —</option>
                  {tgConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-sm"><span className="mb-1 block text-zinc-600">AI soát chính sách (khuyên dùng)</span>
                <select className={input} value={aiConnId} onChange={(e) => setAiConnId(e.target.value)}>
                  <option value="">— bỏ qua —</option>
                  {aiConns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-sm"><span className="mb-1 block text-zinc-600">Tên cấu hình</span>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="rounded-md border px-4 py-2 text-sm">← Lùi</button>
                <button onClick={save} disabled={saving || !notifyConnId} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {saving ? "Đang lưu…" : "Tạo cấu hình"}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="h-fit rounded-lg border bg-[var(--card)] p-4 text-sm">
          <div className="mb-2 font-medium">Tóm tắt</div>
          <dl className="space-y-1 text-xs text-zinc-600">
            <div className="flex justify-between"><dt>Page</dt><dd>{pages.find((p) => p.id === pageId)?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Mẫu</dt><dd>{templates.find((t) => t.id === templateId)?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>Keywords</dt><dd>{keywords.split("\n").filter(Boolean).length}</dd></div>
            <div className="flex justify-between"><dt>Hashtags</dt><dd>{hashtags.split("\n").filter(Boolean).length}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-zinc-400">Pipeline: page đăng bài → khớp keyword → AI soát → campaign PAUSED chờ duyệt.</p>
        </aside>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Conn = { id: string; name: string; meta: Record<string, unknown> };
type Entity = { id: string; name: string; daily_budget?: string; effective_status?: string; campaign_id?: string };
type Slot = { from: string; to: string; budget: number };

const input = "w-full rounded-md border px-3 py-2 text-sm";

export function BudgetWizard({ slug, connections }: { slug: string; connections: Conn[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [credentialId, setCredentialId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [level, setLevel] = useState<"campaign" | "adset">("campaign");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [target, setTarget] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<Slot[]>([{ from: "22:00", to: "06:00", budget: 100000 }]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const adAccounts = (connections.find((c) => c.id === credentialId)?.meta?.adAccounts as { id: string; name: string }[] | undefined) ?? [];

  async function loadEntities(lv: "campaign" | "adset") {
    setLevel(lv); setLoading(true); setEntities([]);
    const res = await fetch(`/api/biz/${slug}/meta/entities?conn=${credentialId}&acc=${encodeURIComponent(adAccountId)}&level=${lv}`);
    const j = await res.json();
    setLoading(false);
    if (Array.isArray(j)) setEntities(j);
    else setError(j.error ?? "Không tải được danh sách");
  }

  async function save() {
    setSaving(true); setError("");
    const res = await fetch(`/api/biz/${slug}/configs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "budget_schedule", provider: "facebook",
        name: name || `Lịch ngân sách — ${target?.name}`,
        credentialId, intervalMinutes: 10,
        params: { adAccountId, targetLevel: level, targetId: target?.id, targetName: target?.name, slots },
      }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Lỗi"); return; }
    router.push(`/biz/${slug}/dashboard/configs`);
  }

  const stepTitles = ["Chọn TKQC", `Chọn ${level === "campaign" ? "chiến dịch (CBO)" : "nhóm QC (ABO)"}`, "Khung giờ & ngân sách"];

  return (
    <main className="px-[18px] pb-10 pt-6">
      <h1 className="ui-h1 mb-6">Tăng giảm ngân sách theo lịch</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="rounded-lg border bg-[var(--card)] p-6">
          {/* Steps indicator */}
          <div className="mb-6 flex gap-2">
            {stepTitles.map((t, i) => (
              <div key={t} className={`flex-1 rounded-md px-3 py-2 text-center text-xs ${i === step ? "bg-blue-600 text-white" : i < step ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-500"}`}>
                {i + 1}. {t}
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-3">
              {connections.length === 0 && <p className="text-sm text-zinc-500">Chưa có kết nối Meta Ads — vào Kết nối để thêm.</p>}
              {connections.map((c) => (
                <button key={c.id} onClick={() => setCredentialId(c.id)}
                  className={`block w-full rounded-lg border p-4 text-left ${credentialId === c.id ? "border-blue-600 bg-blue-50" : "hover:border-blue-300"}`}>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-zinc-500">{((c.meta?.adAccounts as unknown[]) ?? []).length} ad account</div>
                </button>
              ))}
              {credentialId && adAccounts.length > 0 && (
                <label className="block text-sm"><span className="mb-1 block text-zinc-600">Ad Account</span>
                  <select className={input} value={adAccountId} onChange={(e) => setAdAccountId(e.target.value)}>
                    <option value="">— chọn —</option>
                    {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
                  </select>
                </label>
              )}
              <button disabled={!adAccountId} onClick={() => { setStep(1); loadEntities("campaign"); }}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Tiếp →</button>
            </div>
          )}

          {step === 1 && (
            <div>
              <div className="mb-3 flex gap-2">
                {(["campaign", "adset"] as const).map((lv) => (
                  <button key={lv} onClick={() => loadEntities(lv)}
                    className={`rounded-full border px-3 py-1 text-xs ${level === lv ? "border-blue-600 bg-blue-50 text-blue-700" : ""}`}>
                    {lv === "campaign" ? "Chiến dịch (CBO)" : "Nhóm QC (ABO)"}
                  </button>
                ))}
              </div>
              {loading ? <p className="text-sm text-zinc-500">Đang tải…</p> : (
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {entities.map((e) => (
                    <button key={e.id} onClick={() => setTarget(e)}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${target?.id === e.id ? "border-blue-600 bg-blue-50" : "hover:border-blue-300"}`}>
                      <span>{e.name}</span>
                      <span className="text-xs text-zinc-500">{e.daily_budget ? `${Number(e.daily_budget).toLocaleString("vi-VN")}₫/ngày` : "—"} · {e.effective_status}</span>
                    </button>
                  ))}
                  {entities.length === 0 && <p className="text-sm text-zinc-500">Không có {level} nào.</p>}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button onClick={() => setStep(0)} className="rounded-md border px-4 py-2 text-sm">← Lùi</button>
                <button disabled={!target} onClick={() => setStep(2)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Tiếp →</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="mb-3 block text-sm"><span className="mb-1 block text-zinc-600">Tên cấu hình</span>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={`Lịch ngân sách — ${target?.name}`} />
              </label>
              <div className="mb-2 text-sm font-medium">Khung giờ & ngân sách (₫/ngày)</div>
              {slots.map((s, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <input type="time" className={input} value={s.from} onChange={(e) => setSlots(slots.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} />
                  <span className="text-zinc-400">→</span>
                  <input type="time" className={input} value={s.to} onChange={(e) => setSlots(slots.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} />
                  <input type="number" className={input} value={s.budget} onChange={(e) => setSlots(slots.map((x, j) => j === i ? { ...x, budget: Number(e.target.value) } : x))} />
                  <button onClick={() => setSlots(slots.filter((_, j) => j !== i))} className="text-xs text-red-600">x</button>
                </div>
              ))}
              <button onClick={() => setSlots([...slots, { from: "00:00", to: "06:00", budget: 100000 }])}
                className="mb-4 text-xs text-blue-600 hover:underline">+ Thêm khung giờ</button>
              <p className="mb-4 text-xs text-zinc-500">Ngoài khung giờ hệ thống tự trả về ngân sách gốc ({target?.daily_budget ? `${Number(target.daily_budget).toLocaleString("vi-VN")}₫` : "đọc lúc chạy"}).</p>
              {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="rounded-md border px-4 py-2 text-sm">← Lùi</button>
                <button onClick={save} disabled={saving || slots.length === 0}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {saving ? "Đang lưu…" : "Lưu cấu hình"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Summary side */}
        <aside className="h-fit rounded-lg border bg-[var(--card)] p-4 text-sm">
          <div className="mb-2 font-medium">Tóm tắt</div>
          <dl className="space-y-1 text-xs text-zinc-600">
            <div className="flex justify-between"><dt>Kết nối</dt><dd>{connections.find((c) => c.id === credentialId)?.name ?? "—"}</dd></div>
            <div className="flex justify-between"><dt>TKQC</dt><dd className="font-mono">{adAccountId || "—"}</dd></div>
            <div className="flex justify-between"><dt>Đối tượng</dt><dd>{target ? `${level === "campaign" ? "CBO" : "ABO"} · ${target.name}` : "—"}</dd></div>
            <div className="flex justify-between"><dt>Khung giờ</dt><dd>{slots.length} slot</dd></div>
          </dl>
        </aside>
      </div>
    </main>
  );
}

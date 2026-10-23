"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { IconPlus, IconTarget } from "../icons";

export type ThresholdRow = {
  id: string; platform: string; name: string;
  limits: Record<string, Record<string, number | undefined> | undefined>;
  minDataPct: number; maxPct: number; createdAt: string;
};

const PLATFORMS = [
  { id: "meta", label: "Meta" }, { id: "tiktok", label: "TikTok" }, { id: "google", label: "Google Ads" },
];

const GROUPS = [
  { key: "replies", title: "Tin nhắn (REPLIES)", fields: [["perPurchase", "₫/lượt mua qua tin nhắn"], ["perMessage", "₫/tin nhắn"]] },
  { key: "offsite_conversions", title: "Chuyển đổi (OFFSITE_CONVERSIONS)", fields: [["perPurchase", "₫/lượt mua"], ["perRegistration", "₫/hoàn tất đăng ký"]] },
  { key: "lead_generation", title: "Lead Form (LEAD_GENERATION)", fields: [["perLead", "₫/lead"], ["perRegistration", "₫/hoàn tất đăng ký"]] },
] as const;

const input = "w-full rounded-md border px-3 py-2 text-sm";

export function CpaClient({ slug, canManage, thresholds }: { slug: string; canManage: boolean; thresholds: ThresholdRow[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState("meta");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = thresholds.filter((t) => t.platform === platform);

  async function remove(id: string) {
    if (!confirm("Xoá ngưỡng này?")) return;
    setBusy(true);
    await fetch(`/api/biz/${slug}/cpa/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  const fmt = (v?: number) => (v ? `${v.toLocaleString("vi-VN")}₫` : "—");
  const grp = (t: ThresholdRow, key: string) => t.limits?.[key] as Record<string, number> | undefined;

  const label = PLATFORMS.find((p) => p.id === platform)?.label ?? "Meta";

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="ui-h1">Ngưỡng CPA</h1>
          <p className="ui-sub mt-2 max-w-[720px]">
            Tạo nhiều bộ ngưỡng CPA có tên cho từng nền tảng; mỗi cấu hình Ads Autopilot chọn một bộ.
          </p>
        </div>
        {canManage && (
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="ui-btn-primary shrink-0" style={{ height: 38 }}>
              <IconPlus size={15} />
              Thêm ngưỡng
            </Dialog.Trigger>
            <AddThreshold slug={slug} platform={platform} onDone={() => { setOpen(false); router.refresh(); }} />
          </Dialog.Root>
        )}
      </div>

      <section className="ui-card mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-1 px-3 pt-3">
          {PLATFORMS.map((p) => {
            const count = thresholds.filter((t) => t.platform === p.id).length;
            const on = platform === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium transition-colors"
                style={on ? { background: "var(--surface-3)", color: "var(--ink-900)" } : { color: "var(--ink-500)" }}
              >
                {p.label}
                <span
                  className="rounded-full px-1.5 text-[11px] font-semibold"
                  style={{ background: on ? "var(--surface-3)" : "var(--surface-3)", color: "var(--ink-500)" }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-full border"
              style={{ borderColor: "var(--line)", background: "var(--surface-3)", color: "var(--brand)" }}
            >
              <IconTarget size={24} />
            </span>
            <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              Chưa có ngưỡng CPA nào cho {label}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-500)" }}>
              Mỗi cấu hình Ads Autopilot cần một bộ ngưỡng CPA để biết khi nào nên tắt quảng cáo.
            </p>
            {canManage && (
              <button type="button" onClick={() => setOpen(true)} className="ui-btn mt-3">
                <IconPlus size={14} />
                Thêm ngưỡng
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2">
            {visible.map((t) => (
              <div key={t.id} className="flex flex-wrap items-start gap-4 border-t px-5 py-3.5" style={{ borderColor: "var(--line)" }}>
                <div className="min-w-[180px] flex-1">
                  <div className="text-[13.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
                    {t.name}
                  </div>
                  <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-400)" }}>
                    đủ data ≥ {t.minDataPct}% · tắt ngay &gt; {t.maxPct}% mục tiêu
                  </div>
                </div>
                <div className="grid flex-[2] gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-3">
                  <div style={{ color: "var(--ink-600)" }}>
                    Tin nhắn:{" "}
                    <strong style={{ color: "var(--ink-900)" }}>
                      {fmt(grp(t, "replies")?.perMessage)}/tin · {fmt(grp(t, "replies")?.perPurchase)}/mua
                    </strong>
                  </div>
                  <div style={{ color: "var(--ink-600)" }}>
                    Chuyển đổi:{" "}
                    <strong style={{ color: "var(--ink-900)" }}>
                      {fmt(grp(t, "offsite_conversions")?.perPurchase)}/mua · {fmt(grp(t, "offsite_conversions")?.perRegistration)}/đăng ký
                    </strong>
                  </div>
                  <div style={{ color: "var(--ink-600)" }}>
                    Lead form:{" "}
                    <strong style={{ color: "var(--ink-900)" }}>
                      {fmt(grp(t, "lead_generation")?.perLead)}/lead · {fmt(grp(t, "lead_generation")?.perRegistration)}/đăng ký
                    </strong>
                  </div>
                </div>
                {canManage && (
                  <button
                    disabled={busy}
                    onClick={() => remove(t.id)}
                    className="text-[12.5px] font-medium hover:underline disabled:opacity-50"
                    style={{ color: "var(--danger-ink)" }}
                  >
                    Xoá
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function AddThreshold({ slug, platform, onDone }: { slug: string; platform: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [limits, setLimits] = useState<Record<string, Record<string, string>>>({});
  const [minDataPct, setMinDataPct] = useState("120");
  const [maxPct, setMaxPct] = useState("200");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setF = (g: string, f: string, v: string) => setLimits((s) => ({ ...s, [g]: { ...(s[g] ?? {}), [f]: v } }));

  async function submit() {
    setSaving(true); setError("");
    const parsed: Record<string, Record<string, number>> = {};
    for (const [g, fs] of Object.entries(limits)) {
      for (const [f, v] of Object.entries(fs)) {
        const n = Number(v);
        if (v && n > 0) (parsed[g] ??= {})[f] = n;
      }
    }
    const res = await fetch(`/api/biz/${slug}/cpa`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform, name, limits: parsed, minDataPct: Number(minDataPct), maxPct: Number(maxPct) }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Lỗi"); return; }
    onDone();
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(640px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-[var(--card)] p-6 shadow-xl">
        <Dialog.Title className="mb-4 text-lg font-semibold">Thêm ngưỡng CPA — {PLATFORMS.find((p) => p.id === platform)?.label}</Dialog.Title>

        <label className="mb-4 block text-sm"><span className="mb-1 block text-zinc-600">Tên ngưỡng *</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Ngưỡng chuẩn tháng này" />
        </label>

        {GROUPS.map((g) => (
          <div key={g.key} className="mb-4">
            <div className="mb-1 text-sm font-medium">{g.title}</div>
            <div className="grid grid-cols-2 gap-3">
              {g.fields.map(([f, label]) => (
                <label key={f} className="block text-sm">
                  <span className="mb-1 block text-xs text-zinc-500">{label}</span>
                  <input type="number" className={input} placeholder="Bỏ trống = không áp"
                    value={limits[g.key]?.[f] ?? ""} onChange={(e) => setF(g.key, f, e.target.value)} />
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block text-xs text-zinc-500">Ngưỡng đủ data (% mục tiêu)</span>
            <input type="number" className={input} value={minDataPct} onChange={(e) => setMinDataPct(e.target.value)} />
          </label>
          <label className="block text-sm"><span className="mb-1 block text-xs text-zinc-500">Ngưỡng tối đa (% — vượt tắt ngay)</span>
            <input type="number" className={input} value={maxPct} onChange={(e) => setMaxPct(e.target.value)} />
          </label>
        </div>

        {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <Dialog.Close className="rounded-md border px-4 py-2 text-sm">Hủy</Dialog.Close>
          <button onClick={submit} disabled={saving || !name}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Đang tạo…" : "Tạo ngưỡng"}
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

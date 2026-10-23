"use client";

// Cài đặt bảng Chỉ số quảng cáo — sửa trực tiếp "view" của người dùng (API gốc).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AD_CATALOG,
  AD_LEVELS,
  MAX_CUSTOM_FIELDS,
  MAX_VIEW_COLUMNS,
  catalogFor,
  type AdLevel,
  type AdPlatform,
} from "@/lib/ad-catalog";
import { type CustomField, type FormulaFormat } from "@/lib/formula";
import {
  IconArrowDown,
  IconArrowUp,
  IconChart,
  IconCheck,
  IconClose,
  IconInfo,
  IconPlus,
  IconStar,
} from "../../icons";

type SourcePlatformLite = { platform: AdPlatform; label: string; accounts: { account_key: string }[] };

type AdView = {
  columns: string[];
  highlights: string[];
  merge_accounts: boolean;
  default_level: AdLevel;
  custom_fields: CustomField[];
};

const LEVEL_LABEL: Record<AdLevel, string> = {
  campaign: "Chiến dịch",
  adset: "Nhóm quảng cáo",
  ad: "Quảng cáo",
};

function defaultView(platform: AdPlatform): AdView {
  const cat = catalogFor(platform);
  return {
    columns: [...cat.default_columns],
    highlights: [],
    merge_accounts: true,
    default_level: cat.levels.includes("campaign") ? "campaign" : cat.levels[0],
    custom_fields: [],
  };
}

export function AdMetricsSettingsClient({ slug }: { slug: string }) {
  const [platform, setPlatform] = useState<AdPlatform>("meta");
  const [views, setViews] = useState<Record<string, AdView | null>>({});
  const [draft, setDraft] = useState<AdView>(defaultView("meta"));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [formError, setFormError] = useState("");
  const [sources, setSources] = useState<SourcePlatformLite[]>([]);

  const catalog = AD_CATALOG[platform];
  const metricByKey = useMemo(() => new Map(catalog.metrics.map((m) => [m.key, m])), [catalog]);

  useEffect(() => {
    fetch(`/api/biz/${slug}/ad-metrics/views`)
      .then((r) => r.json())
      .then((j) => {
        const v: Record<string, AdView | null> = j.views ?? {};
        setViews(v);
        setDraft(v[platform] ?? defaultView(platform));
      })
      .catch(() => setMsg("Không tải được bố cục đã lưu."))
      .finally(() => setLoading(false));
    fetch(`/api/biz/${slug}/ad-metrics/sources`)
      .then((r) => (r.ok ? r.json() : { platforms: [] }))
      .then((j) => setSources(Array.isArray(j.platforms) ? j.platforms : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function switchPlatform(next: AdPlatform) {
    setPlatform(next);
    setDraft(views[next] ?? defaultView(next));
    setDirty(false);
    setEditing(null);
    setMsg("");
  }

  function patch(p: Partial<AdView>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  }

  function toggleColumn(key: string) {
    const exists = draft.columns.includes(key);
    if (exists && draft.columns.length <= 1) return;
    if (!exists && draft.columns.length >= MAX_VIEW_COLUMNS) {
      setMsg(`Tối đa ${MAX_VIEW_COLUMNS} cột.`);
      return;
    }
    const columns = exists ? draft.columns.filter((c) => c !== key) : [...draft.columns, key];
    patch({ columns, highlights: draft.highlights.filter((h) => columns.includes(h)) });
  }

  function move(key: string, dir: -1 | 1) {
    const i = draft.columns.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= draft.columns.length) return;
    const columns = [...draft.columns];
    [columns[i], columns[j]] = [columns[j], columns[i]];
    patch({ columns });
  }

  function toggleStar(key: string) {
    patch({
      highlights: draft.highlights.includes(key) ? draft.highlights.filter((h) => h !== key) : [...draft.highlights, key],
    });
  }

  function saveField(field: CustomField) {
    setFormError("");
    const allowed = catalog.metrics.map((m) => m.key);
    if (!/^cf_[a-z0-9_]{1,40}$/.test(field.key)) {
      setFormError("Mã trường phải bắt đầu bằng cf_, sau đó là a-z, 0-9 hoặc _.");
      return;
    }
    const refs = [...field.formula.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim());
    const unknown = refs.find((r) => !allowed.includes(r));
    if (unknown) return setFormError(`Chỉ số "${unknown}" không có trên nền tảng này.`);
    if (!refs.length) return setFormError("Công thức cần tham chiếu ít nhất một chỉ số.");
    if (!field.name.trim()) return setFormError("Nhập tên trường.");
    const exists = draft.custom_fields.some((f) => f.key === field.key);
    if (exists && !editing) return setFormError("Mã trường đã tồn tại.");
    if (!exists && draft.custom_fields.length >= MAX_CUSTOM_FIELDS) {
      return setFormError(`Tối đa ${MAX_CUSTOM_FIELDS} trường tuỳ chỉnh.`);
    }
    const nextFields = exists
      ? draft.custom_fields.map((f) => (f.key === field.key ? field : f))
      : [...draft.custom_fields, field];
    const columns = exists || draft.columns.includes(field.key) ? draft.columns : [...draft.columns, field.key];
    patch({ custom_fields: nextFields, columns });
    setEditing(null);
  }

  function removeField(key: string) {
    if (!confirm(`Xoá trường "${key}"?`)) return;
    patch({
      custom_fields: draft.custom_fields.filter((f) => f.key !== key),
      columns: draft.columns.filter((c) => c !== key),
      highlights: draft.highlights.filter((c) => c !== key),
    });
  }

  async function save() {
    setMsg("");
    const res = await fetch(`/api/biz/${slug}/ad-metrics/views/${platform}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(Array.isArray(j.detail) ? j.detail.map((d: any) => d.msg).join(" · ") : (j.detail ?? "Không lưu được."));
      return;
    }
    setDraft(j.view ?? draft);
    setViews((v) => ({ ...v, [platform]: j.view ?? draft }));
    setDirty(false);
    setMsg("Đã lưu.");
  }

  async function reset() {
    if (!confirm("Khôi phục bố cục mặc định của nền tảng này?")) return;
    const res = await fetch(`/api/biz/${slug}/ad-metrics/views/${platform}`, { method: "DELETE" });
    if (!res.ok) return setMsg("Không khôi phục được.");
    setViews((v) => ({ ...v, [platform]: null }));
    setDraft(defaultView(platform));
    setDirty(false);
    setMsg("Đã khôi phục mặc định.");
  }

  if (loading) return <main className="p-6 text-sm text-zinc-500">Đang tải…</main>;

  const accountCount = sources.find((s) => s.platform === platform)?.accounts.length ?? 0;
  const platformLabel = catalog.label;
  const FORMAT_LABEL: Record<string, string> = {
    currency: "Tiền tệ",
    percent: "Phần trăm",
    number: "Số",
    decimal: "Số thập phân",
    text: "Văn bản",
  };

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">Cấu hình</h1>
          <p className="ui-sub mt-2 max-w-[720px]">
            Chọn cột, gộp tài khoản, đánh dấu và tạo chỉ số tuỳ chỉnh cho bảng Hiển thị kết quả – cấu hình này là của
            riêng bạn trong Biz này.
          </p>
        </div>
        <Link href={`/biz/${slug}/dashboard/ad-metrics`} className="ui-btn" style={{ height: 38 }}>
          <IconChart size={15} />
          Xem kết quả
        </Link>
      </div>

      {/* Nền tảng */}
      <section className="ui-card mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-1 px-3 pt-3">
          {(Object.keys(AD_CATALOG) as AdPlatform[]).map((key) => {
            const on = platform === key;
            const count = sources.find((s) => s.platform === key)?.accounts.length ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => switchPlatform(key)}
                className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] font-semibold transition-colors"
                style={on ? { background: "var(--brand-soft)", color: "var(--brand)" } : { color: "var(--ink-500)" }}
              >
                {AD_CATALOG[key].label}
                {on && count > 0 && (
                  <span
                    className="rounded-full px-1.5 text-[11px] font-bold"
                    style={{ background: "var(--card)", color: "var(--brand)" }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-2">
          <span className="text-[13px]" style={{ color: "var(--ink-600)" }}>
            {accountCount} tài khoản {platformLabel} đã kết nối
          </span>
          <span
            className="rounded-full px-2.5 py-1 text-[12px] font-medium"
            style={{ background: "var(--surface-3)", color: "var(--ink-500)" }}
          >
            Đang dùng mặc định
          </span>
        </div>
      </section>

      {/* Cột hiển thị */}
      <section className="ui-card mt-3 overflow-hidden p-0">
        <div className="px-5 pb-2 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="ui-h2">Cột hiển thị</h2>
            <span
              className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              {draft.columns.length}/{MAX_VIEW_COLUMNS} cột
            </span>
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--ink-500)" }}>
            Chọn và sắp xếp cột của bảng. Bấm ngôi sao để đánh dấu cột quan trọng – cột được đánh dấu tô nền trên
            bảng kết quả.
          </p>
        </div>

        <div className="px-5">
          <div className="mb-2 text-[13px] font-semibold" style={{ color: "var(--ink-700)" }}>
            Đã chọn
          </div>
          <div className="space-y-1.5">
            {draft.columns.map((key, i) => {
              const custom = draft.custom_fields.find((f) => f.key === key);
              const def = metricByKey.get(key);
              const sub = custom
                ? `Công thức · ${FORMAT_LABEL[custom.format] ?? custom.format}`
                : `${FORMAT_LABEL[def?.format ?? "number"] ?? "Số"} · ${def?.group ?? ""}`;
              return (
                <div
                  key={key}
                  className="flex items-center gap-2.5 rounded-xl border bg-[var(--card)] px-3 py-2"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                    style={{ background: "var(--surface-3)", color: "var(--ink-500)" }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium" style={{ color: "var(--ink-900)" }}>
                      {def?.label ?? custom?.name ?? key}
                      {custom && <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--brand)" }}>ƒ</span>}
                    </span>
                    <span className="block truncate text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                      {sub}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleStar(key)}
                    title="Cột chính (in đậm)"
                    className="px-1"
                    style={{ color: draft.highlights.includes(key) ? "var(--warn-ink)" : "var(--ink-300)" }}
                  >
                    <IconStar size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(key, -1)}
                    disabled={i === 0}
                    className="px-1 disabled:opacity-30"
                    style={{ color: "var(--ink-500)" }}
                    title="Lên"
                  >
                    <IconArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(key, 1)}
                    disabled={i === draft.columns.length - 1}
                    className="px-1 disabled:opacity-30"
                    style={{ color: "var(--ink-500)" }}
                    title="Xuống"
                  >
                    <IconArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleColumn(key)}
                    className="px-1"
                    style={{ color: "var(--ink-400)" }}
                    title="Bỏ cột"
                  >
                    <IconClose size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mb-2 mt-4 text-[13px] font-semibold" style={{ color: "var(--ink-700)" }}>
            Thêm cột
          </div>
          <div className="mb-1 space-y-1">
            {catalog.metrics
              .filter((m) => !draft.columns.includes(m.key))
              .map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggleColumn(m.key)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--surface-3)]"
                >
                  <span style={{ color: "var(--ink-400)" }}>
                    <IconPlus size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]" style={{ color: "var(--ink-800)" }}>
                      {m.label}
                    </span>
                  </span>
                  <span className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                    {m.group}
                  </span>
                </button>
              ))}
            {catalog.metrics.every((m) => draft.columns.includes(m.key)) && (
              <p className="px-2 py-1 text-[12px]" style={{ color: "var(--ink-400)" }}>
                Đã thêm tất cả chỉ số.
              </p>
            )}
          </div>
        </div>

        {/* Thanh lưu */}
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3"
          style={{ borderColor: "var(--line)" }}
        >
          <span
            className="inline-flex items-center gap-1.5 text-[13px]"
            style={{ color: dirty ? "var(--warn-ink)" : "var(--ok-ink)" }}
          >
            {dirty ? <IconInfo size={14} /> : <IconCheck size={14} />}
            {dirty ? "Có thay đổi chưa lưu" : "Đã lưu mọi thay đổi"}
            {msg && <span style={{ color: "var(--ink-500)" }}>· {msg}</span>}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void reset()} className="ui-btn">
              Khôi phục mặc định
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty}
              className="ui-btn-primary disabled:opacity-50"
            >
              Lưu cấu hình
            </button>
          </div>
        </div>
      </section>

      {/* Tuỳ chọn chung */}
      <section className="ui-card mt-3 p-5">
        <h2 className="ui-h2">Tuỳ chọn chung</h2>
        <div className="mt-3 flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-700)" }}>
            <input
              type="checkbox"
              checked={draft.merge_accounts}
              onChange={(e) => patch({ merge_accounts: e.target.checked })}
            />
            Gộp tài khoản (cộng số liệu cùng một chiến dịch)
          </label>
          <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-700)" }}>
            Cấp mặc định
            <select
              value={draft.default_level}
              onChange={(e) => patch({ default_level: e.target.value as AdLevel })}
              className="rounded-xl border px-2 py-1 text-[13px]"
              style={{ borderColor: "var(--line-strong)" }}
            >
              {AD_LEVELS.filter((l) => catalog.levels.includes(l)).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Trường công thức */}
      <section className="ui-card mt-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="ui-h2">
            Trường công thức{" "}
            <span className="text-[13px] font-normal" style={{ color: "var(--ink-400)" }}>
              {draft.custom_fields.length}/{MAX_CUSTOM_FIELDS}
            </span>
          </h2>
          <button
            type="button"
            onClick={() =>
              setEditing({
                key: `cf_${(draft.custom_fields.length + 1).toString(36)}_${Date.now().toString(36).slice(-4)}`,
                name: "",
                formula: "",
                format: "decimal",
                decimals: 2,
              })
            }
            className="text-[12.5px] font-medium"
            style={{ color: "var(--brand)" }}
          >
            + Thêm
          </button>
        </div>

        {draft.custom_fields.length === 0 && (
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-400)" }}>
            Ví dụ: ROI = <code className="font-mono">{"{action_values_purchase}/{spend}"}</code>
          </p>
        )}

        <div className="mt-2 space-y-1">
          {draft.custom_fields.map((f) => (
            <div
              key={f.key}
              className="flex items-center gap-2 rounded-xl border px-3 py-2"
              style={{ borderColor: "var(--line)" }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]" style={{ color: "var(--ink-800)" }}>
                  {f.name}
                </span>
                <span className="block truncate font-mono text-[11px]" style={{ color: "var(--ink-400)" }}>
                  {f.formula}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setEditing(f)}
                className="text-[12px] font-medium"
                style={{ color: "var(--brand)" }}
              >
                Sửa
              </button>
              <button
                type="button"
                onClick={() => removeField(f.key)}
                className="text-[12px] font-medium"
                style={{ color: "var(--danger-ink)" }}
              >
                Xoá
              </button>
            </div>
          ))}
        </div>

        {editing && (
          <div className="mt-3 space-y-2 rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Tên hiển thị"
              className="w-full rounded-xl border px-2 py-1.5 text-[13px]"
              style={{ borderColor: "var(--line-strong)" }}
            />
            <input
              value={editing.formula}
              onChange={(e) => setEditing({ ...editing, formula: e.target.value })}
              placeholder="{spend}/{actions_purchase}"
              className="w-full rounded-xl border px-2 py-1.5 font-mono text-[12px]"
              style={{ borderColor: "var(--line-strong)" }}
            />
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <select
                value={editing.format}
                onChange={(e) => setEditing({ ...editing, format: e.target.value as FormulaFormat })}
                className="rounded-xl border px-2 py-1"
                style={{ borderColor: "var(--line-strong)" }}
              >
                <option value="decimal">Số thập phân</option>
                <option value="number">Số nguyên</option>
                <option value="currency">Tiền tệ</option>
                <option value="percent">Phần trăm</option>
              </select>
              <label className="flex items-center gap-1">
                Thập phân
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={editing.decimals}
                  onChange={(e) =>
                    setEditing({ ...editing, decimals: Math.max(0, Math.min(4, Number(e.target.value))) })
                  }
                  className="w-14 rounded-xl border px-1 py-1"
                  style={{ borderColor: "var(--line-strong)" }}
                />
              </label>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setFormError("");
                  }}
                  className="ui-btn"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  onClick={() => saveField({ ...editing, name: editing.name.trim() })}
                  className="ui-btn-primary"
                >
                  Lưu trường
                </button>
              </div>
            </div>
            {formError && (
              <p className="text-[11.5px]" style={{ color: "var(--danger-ink)" }}>
                {formError}
              </p>
            )}
            <p className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
              Dùng <code className="font-mono">{"{metric_key}"}</code> + - * / ( ). Bỏ trống mã trường để hệ thống tự
              sinh.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

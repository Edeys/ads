"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { IconEye, IconPlus, IconSearch } from "../../icons";

type Field = { key: string; label: string };
type Entity = { entity: string; label: string; fieldCount: number; minimalCount: number; fields: Field[]; minimal: string[] };
type Provider = { key: string; label: string; initial: string; entities: Entity[] };
type Preset = {
  id: string;
  provider: string;
  name: string;
  description: string;
  config: Record<string, string[] | "toi-gian">;
  kind: "minimal" | "system" | "custom";
  isSystem: boolean;
  fieldCount: number;
};

const input = "w-full rounded-md border px-3 py-2 text-sm";

const KIND_BADGE: Record<Preset["kind"], { label: string; className: string }> = {
  minimal: { label: "Hệ thống", className: "bg-zinc-100 text-zinc-600" },
  system: { label: "Đề xuất", className: "bg-blue-50 text-blue-700" },
  custom: { label: "Của bạn", className: "bg-emerald-50 text-emerald-700" },
};

export function FieldPresetsClient({ slug }: { slug: string }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [tab, setTab] = useState("meta");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const j = await fetch(`/api/biz/${slug}/field-presets`).then((r) => r.json()).catch(() => null);
    if (j?.providers) setProviders(j.providers);
    if (j?.presets) setPresets(j.presets);
  }
  useEffect(() => { load(); }, [slug]);

  const provider = providers.find((p) => p.key === tab);
  const entities = provider?.entities ?? [];
  const visible = presets.filter((p) => p.provider === tab);

  const fieldLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entities) for (const f of e.fields) map.set(`${e.entity}:${f.key}`, f.label);
    for (const e of entities) for (const f of e.fields) if (!map.has(f.key)) map.set(f.key, f.label);
    return map;
  }, [entities]);

  const selectedCount = useMemo(
    () => Object.values(selected).reduce((n, v) => n + v.length, 0),
    [selected],
  );

  function startCreate() {
    const seed: Record<string, string[]> = {};
    for (const e of entities) seed[e.entity] = [...e.minimal];
    setName("");
    setSelected(seed);
    setSearch("");
    setExpanded(entities[0]?.entity ?? null);
    setError("");
    setOpen(true);
  }

  function toggle(entity: string, key: string) {
    setSelected((prev) => {
      const cur = prev[entity] ?? [];
      return { ...prev, [entity]: cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key] };
    });
  }

  function selectAll(entity: string, keys: string[]) {
    setSelected((prev) => ({ ...prev, [entity]: keys }));
  }

  async function save() {
    setError("");
    if (!name.trim()) return setError("Nhập tên bộ chỉ số");
    const config: Record<string, string[]> = {};
    for (const [entity, keys] of Object.entries(selected)) if (keys.length) config[entity] = keys;
    if (!Object.keys(config).length) return setError("Chọn ít nhất một trường cho một loại dữ liệu");
    setSaving(true);
    const res = await fetch(`/api/biz/${slug}/field-presets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: tab, name: name.trim(), config }),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(j.detail ?? j.error ?? "Lưu thất bại");
    setOpen(false);
    load();
  }

  async function remove(p: Preset) {
    if (!confirm(`Xoá bộ chỉ số "${p.name}"? Các key đã tạo vẫn giữ nguyên cấu hình đã sao chép.`)) return;
    await fetch(`/api/biz/${slug}/field-presets?id=${p.id}`, { method: "DELETE" });
    load();
  }

  const q = search.trim().toLowerCase();

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="ui-h1">Bộ chỉ số</h1>
          <p className="ui-sub mt-2 max-w-[720px]">
            Mỗi nền tảng chọn một bộ field trả về khi tạo MCP key (mặc định Tối giản).
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/biz/${slug}/dashboard/mcp-keys/skills`} className="ui-btn" style={{ height: 38 }}>
            Skill Hub
          </Link>
          <button
            onClick={startCreate}
            disabled={!provider}
            className="ui-btn-primary"
            style={{ height: 38 }}
            type="button"
          >
            <IconPlus size={15} />
            Tạo bộ chỉ số
          </button>
        </div>
      </div>

      <section className="ui-card mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <div className="ui-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-[14px] p-1" style={{ background: "var(--surface-3)" }}>
            {providers.map((p) => {
              const count = presets.filter((x) => x.provider === p.key).length;
              const on = tab === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setTab(p.key)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors"
                  style={
                    on
                      ? { background: "var(--card)", color: "var(--ink-900)", boxShadow: "0 1px 2px rgba(13,27,42,.08)" }
                      : { color: "var(--ink-500)" }
                  }
                >
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold"
                    style={{ background: on ? "var(--brand-soft)" : "var(--surface-3)", color: on ? "var(--brand)" : "var(--ink-500)" }}
                  >
                    {p.initial}
                  </span>
                  {p.label}
                  <span
                    className="rounded-full px-1.5 text-[11px] font-semibold"
                    style={{ background: on ? "var(--brand-soft)" : "var(--surface-3)", color: on ? "var(--brand)" : "var(--ink-500)" }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="relative ml-auto block w-[176px]">
            <IconSearch
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--ink-400)" }}
            />
            <input
              className="h-9 w-full rounded-xl border bg-[var(--card)] pl-9 pr-3 text-[13px] outline-none focus:ring-2"
              style={{ borderColor: "var(--line)" }}
              placeholder="Tìm bộ…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2">
          {visible
            .filter((p) => (search.trim() ? p.name.toLowerCase().includes(search.trim().toLowerCase()) : true))
            .map((p) => {
              const badge = KIND_BADGE[p.kind];
              const entityCount = Object.keys(p.config).length;
              const isOpen = expanded === p.id;
              return (
                <div
                  key={p.id}
                  className="flex flex-col rounded-xl border p-3.5"
                  style={{ borderColor: "var(--line)", background: "var(--surface-3)" }}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold"
                      style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                    >
                      {provider?.initial ?? "M"}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
                          {p.name}
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                        {p.kind === "minimal" ? "Tối giản" : "Tuỳ chọn"} · {p.fieldCount} field
                        {entityCount > 0 ? ` · ${entityCount} loại dữ liệu` : ""}
                      </div>
                    </div>
                  </div>

                  {p.description && (
                    <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-500)" }}>
                      {p.description}
                    </p>
                  )}

                  {isOpen && (
                    <div className="mt-2.5 space-y-2 rounded-lg p-2.5" style={{ background: "var(--surface-3)" }}>
                      {entities.map((e) => {
                        const value = p.config[e.entity];
                        const keys = Array.isArray(value) ? value : e.minimal;
                        return (
                          <div key={e.entity}>
                            <div className="text-[11.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                              {e.label} · {keys.length} trường{Array.isArray(value) ? "" : " (tối giản)"}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {keys.slice(0, 12).map((k) => (
                                <span
                                  key={k}
                                  className="rounded bg-[var(--card)] px-1.5 py-0.5 text-[11px]"
                                  style={{ color: "var(--ink-600)" }}
                                >
                                  {fieldLabel.get(`${e.entity}:${k}`) ?? fieldLabel.get(k) ?? k}
                                </span>
                              ))}
                              {keys.length > 12 && (
                                <span className="px-1.5 py-0.5 text-[11px]" style={{ color: "var(--ink-400)" }}>
                                  +{keys.length - 12}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-2 flex items-center justify-end gap-3 text-[12.5px]">
                    {p.kind === "custom" && (
                      <button onClick={() => remove(p)} className="font-medium" style={{ color: "var(--danger-ink)" }}>
                        Xoá
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      className="inline-flex items-center gap-1.5 font-medium"
                      style={{ color: "var(--ink-700)" }}
                    >
                      <IconEye size={14} />
                      {isOpen ? "Ẩn" : "Xem"}
                    </button>
                  </div>
                </div>
              );
            })}
          {visible.length === 0 && (
            <p className="text-[13px]" style={{ color: "var(--ink-400)" }}>
              Chưa có bộ chỉ số cho nền tảng này.
            </p>
          )}
        </div>

        <div className="px-4 py-3 text-[12.5px]" style={{ borderTop: "1px solid var(--line)", color: "var(--ink-500)" }}>
          {provider ? `${visible.length} bộ tuỳ chỉnh cho ${provider.label} (+ Tối giản hệ thống).` : "Đang tải…"}
        </div>
      </section>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[88vh] w-[760px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-[var(--card)] p-6 shadow-xl">
            <Dialog.Title className="text-lg font-semibold">Tạo bộ chỉ số — {provider?.label}</Dialog.Title>
            <p className="mb-3 mt-1 text-xs text-zinc-500">Bộ chỉ số không sửa được sau khi tạo. Loại dữ liệu để trống sẽ dùng bộ tối giản.</p>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-zinc-600">Tên bộ chỉ số *</span>
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Chỉ số chốt đơn" />
            </label>

            <input className={`${input} mb-2`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm trường theo tên hoặc mã…" />

            <div className="min-h-0 flex-1 overflow-y-auto rounded border">
              {entities.map((e) => {
                const keys = selected[e.entity] ?? [];
                const isOpenEntity = expanded === e.entity;
                const fields = q
                  ? e.fields.filter((f) => f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q))
                  : e.fields;
                if (q && !fields.length) return null;
                return (
                  <div key={e.entity} className="border-b last:border-b-0">
                    <button type="button" onClick={() => setExpanded(isOpenEntity ? null : e.entity)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50">
                      <span className="text-sm font-medium">{e.label}</span>
                      <span className="text-xs text-zinc-500">{keys.length}/{e.fieldCount} đã chọn</span>
                    </button>
                    {isOpenEntity && (
                      <div className="border-t bg-zinc-50/60 px-3 py-2">
                        <div className="mb-2 flex items-center gap-3 text-xs">
                          <button type="button" className="text-blue-600 hover:underline" onClick={() => selectAll(e.entity, fields.map((f) => f.key))}>Chọn hết</button>
                          <button type="button" className="text-zinc-600 hover:underline" onClick={() => selectAll(e.entity, [])}>Bỏ chọn hết</button>
                          <button type="button" className="text-zinc-600 hover:underline" onClick={() => selectAll(e.entity, [...e.minimal])}>Dùng tối giản</button>
                        </div>
                        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                          {fields.map((f) => (
                            <label key={f.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--card)]">
                              <input type="checkbox" checked={keys.includes(f.key)} onChange={() => toggle(e.entity, f.key)} />
                              <span className="truncate">{f.label}</span>
                              <span className="ml-auto max-w-[45%] truncate font-mono text-[10px] text-zinc-400">{f.key}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-zinc-500">Đã chọn {selectedCount} trường</span>
              <div className="flex gap-2">
                <Dialog.Close className="rounded-md border px-4 py-2 text-sm">Huỷ</Dialog.Close>
                <button onClick={save} disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {saving ? "Đang lưu…" : "Lưu"}
                </button>
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

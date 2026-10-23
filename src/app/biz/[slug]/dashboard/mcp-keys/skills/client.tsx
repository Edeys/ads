"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { IconBook, IconInfo, IconSearch, IconSparkle, IconUpload } from "../../icons";

type Skill = {
  id: string; name: string; description: string; platforms: string[];
  fileName?: string | null; enabled: boolean; createdAt: string; size: number; usedBy: string[];
};

const PLATFORMS: [string, string][] = [
  ["facebook", "Facebook"], ["tiktok", "TikTok"], ["google", "Google Ads"],
  ["pancake", "Pancake"], ["sheets", "Google Sheets"], ["chung", "Dùng chung"],
];
const input = "w-full rounded-md border px-3 py-2 text-sm";
const labelOf = (id: string) => PLATFORMS.find((p) => p[0] === id)?.[1] ?? id;

export function SkillsClient({ slug }: { slug: string }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Skill | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"mine" | "suggested">("mine");
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const j = await fetch(`/api/biz/${slug}/skills`).then((r) => r.json()).catch(() => null);
    if (Array.isArray(j)) setSkills(j);
  }
  useEffect(() => { load(); }, [slug]);

  function startUpload() {
    setEditing(null); setName(""); setDescription(""); setPlatforms([]); setFile(null); setError("");
    if (fileRef.current) fileRef.current.value = "";
    setOpen(true);
  }
  function startEdit(s: Skill) {
    setEditing(s); setName(s.name); setDescription(s.description); setPlatforms(s.platforms); setFile(null); setError("");
    setOpen(true);
  }
  function togglePlatform(id: string) {
    setPlatforms((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setError("");
    if (!editing && !file) return setError("Chọn file .zip / .skill để tải lên");
    setBusy(true);
    try {
      let res: Response;
      if (editing) {
        res = await fetch(`/api/biz/${slug}/skills`, {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: editing.id, name, description, platforms }),
        });
      } else {
        const fd = new FormData();
        fd.append("file", file as File);
        fd.append("platforms", platforms.join(","));
        if (description.trim()) fd.append("description", description.trim());
        res = await fetch(`/api/biz/${slug}/skills`, { method: "POST", body: fd });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? "Không lưu được skill"); return; }
      setOpen(false); load();
    } finally {
      setBusy(false);
    }
  }
  async function toggleEnabled(s: Skill) {
    await fetch(`/api/biz/${slug}/skills`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, enabled: !s.enabled }),
    });
    load();
  }
  async function remove(s: Skill) {
    if (!confirm(`Xoá skill "${s.name}"? Key đang gắn sẽ không đọc được skill này nữa.`)) return;
    await fetch(`/api/biz/${slug}/skills?id=${s.id}`, { method: "DELETE" });
    load();
  }

  // Tab "Của tôi" lọc theo tên/mô tả; tab "Nền tảng đề xuất" hiện skill hệ thống
  // (không thuộc Biz) để người dùng tham khảo trước khi tự tải lên.
  const suggested = skills.filter((s) => s.usedBy.length === 0);
  const source = tab === "mine" ? skills : suggested;
  const visible = q.trim()
    ? source.filter((s) =>
        `${s.name} ${s.description} ${s.platforms.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : source;

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="ui-h1">Skill Hub</h1>
            <IconInfo size={14} style={{ color: "var(--ink-300)" }} />
          </div>
          <p className="ui-sub mt-2 max-w-[880px]">
            Kho hướng dẫn để AI đọc và làm theo khi bạn chat qua MCP. Gán skill vào key khi tạo MCP Key.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/biz/${slug}/dashboard/mcp-keys/field-presets`} className="ui-btn" style={{ height: 38 }}>
            Bộ chỉ số
          </Link>
          <button onClick={startUpload} className="ui-btn-primary" style={{ height: 38 }} type="button">
            <IconUpload size={14} />
            Tải skill lên
          </button>
        </div>
      </div>

      <section className="ui-card mt-4 overflow-hidden p-0">
        <div className="flex items-center gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={() => setTab("mine")}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium"
            style={
              tab === "mine"
                ? { background: "var(--surface-3)", color: "var(--ink-900)" }
                : { color: "var(--ink-500)" }
            }
          >
            <IconBook size={14} style={{ color: tab === "mine" ? "var(--brand)" : "var(--ink-400)" }} />
            Của tôi
            <span className="rounded-full bg-[var(--surface-3)] px-1.5 text-[11px] font-semibold" style={{ color: "var(--ink-500)" }}>
              {skills.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("suggested")}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium"
            style={
              tab === "suggested"
                ? { background: "var(--surface-3)", color: "var(--ink-900)" }
                : { color: "var(--ink-500)" }
            }
          >
            <IconSparkle size={14} style={{ color: tab === "suggested" ? "var(--brand)" : "var(--ink-400)" }} />
            Nền tảng đề xuất
            <span className="rounded-full bg-[var(--surface-3)] px-1.5 text-[11px] font-semibold" style={{ color: "var(--ink-500)" }}>
              {suggested.length}
            </span>
          </button>
          <label className="relative ml-auto block w-[240px]">
            <IconSearch
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--ink-400)" }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-full rounded-xl border bg-[var(--card)] pl-9 pr-3 text-[13px] outline-none focus:ring-2"
              style={{ borderColor: "var(--line)" }}
              placeholder="Tìm skill"
            />
          </label>
        </div>

        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border"
              style={{ borderColor: "var(--line)", background: "var(--surface-3)", color: "var(--brand)" }}
            >
              <IconBook size={22} />
            </span>
            <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              Chưa có skill nào
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-500)" }}>
              Tải lên một gói .zip hoặc .skill để AI có hướng dẫn làm theo.
            </p>
            <button type="button" onClick={startUpload} className="ui-btn mt-3">
              <IconUpload size={14} />
              Tải skill lên
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-[13.5px]" style={{ color: "var(--ink-500)" }}>
              Không tìm thấy skill nào khớp “{q}”.
            </p>
            <button type="button" onClick={() => setQ("")} className="ui-btn mt-3">
              Xoá tìm kiếm
            </button>
          </div>
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {visible.map((s) => (
              <div key={s.id} className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
                      {s.name}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                      {s.description || "Chưa có mô tả — AI sẽ khó chọn đúng skill."}
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                    style={
                      s.enabled
                        ? { background: "var(--ok-bg)", color: "var(--ok-ink)" }
                        : { background: "var(--surface-3)", color: "var(--ink-500)" }
                    }
                  >
                    {s.enabled ? "Bật" : "Tắt"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.platforms.map((p) => (
                    <span
                      key={p}
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                    >
                      {labelOf(p)}
                    </span>
                  ))}
                  <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--surface-3)", color: "var(--ink-500)" }}>
                    {(s.size / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div className="mt-2 text-[12px]" style={{ color: "var(--ink-400)" }}>
                  {s.usedBy.length ? `Đang gắn: ${s.usedBy.join(", ")}` : "Chưa gắn vào key nào"}
                </div>
                <div className="mt-2 flex gap-3 text-[12.5px]">
                  <button onClick={() => startEdit(s)} className="font-medium hover:underline" style={{ color: "var(--brand)" }}>
                    Sửa
                  </button>
                  <button onClick={() => toggleEnabled(s)} className="font-medium hover:underline" style={{ color: "var(--warn-ink)" }}>
                    {s.enabled ? "Tắt" : "Bật"}
                  </button>
                  <button onClick={() => remove(s)} className="font-medium hover:underline" style={{ color: "var(--danger-ink)" }}>
                    Xoá
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          className="px-4 py-3 text-[12px] leading-relaxed"
          style={{ borderTop: "1px solid var(--line)", color: "var(--ink-500)" }}
        >
          Gói skill cần <code className="font-mono">SKILL.md</code> ở gốc (có frontmatter name/description);{" "}
          <code className="font-mono">references/*.md</code> và <code className="font-mono">scripts/*</code> là tuỳ chọn.
          Phần description quyết định AI có dùng skill hay không — key chỉ đọc được skill đã gắn và đang bật.
        </div>
      </section>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[var(--card)] p-6 shadow-xl">
            <Dialog.Title className="mb-4 text-lg font-semibold">{editing ? "Sửa skill" : "Tải skill lên"}</Dialog.Title>
            <div className="space-y-3">
              {!editing && (
                <label className="block text-sm"><span className="mb-1 block text-zinc-600">File .zip / .skill *</span>
                  <input ref={fileRef} type="file" accept=".zip,.skill,.md" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="w-full rounded-md border px-3 py-2 text-sm" />
                </label>
              )}
              <label className="block text-sm"><span className="mb-1 block text-zinc-600">Tên skill</span>
                <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={editing ? "" : "Lấy từ SKILL.md nếu để trống"} />
              </label>
              <label className="block text-sm"><span className="mb-1 block text-zinc-600">Mô tả (AI dùng để quyết định)</span>
                <textarea className={`${input} h-24`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Khi nào nên dùng skill này…" />
              </label>
              <div className="text-sm">
                <span className="mb-1 block text-zinc-600">Nền tảng đề xuất</span>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(([id, label]) => (
                    <button key={id} type="button" onClick={() => togglePlatform(id)}
                      className={`rounded-full border px-3 py-1 text-xs ${platforms.includes(id) ? "border-blue-600 bg-blue-50 text-blue-700" : "text-zinc-600"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Dialog.Close className="rounded-md border px-4 py-2 text-sm">Huỷ</Dialog.Close>
                <button onClick={save} disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {busy ? "Đang xử lý…" : editing ? "Lưu" : "Tải lên"}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  IconCheck,
  IconCopy,
  IconInfo,
  IconKey,
  IconMore,
  IconPlus,
  IconSearch,
  IconTerminal,
} from "../icons";

type Key = {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  scopes: Record<string, unknown>;
  lastUsedAt?: string;
  createdAt: string;
  callCount: number;
  fieldPresets?: Record<string, string>;
  fieldConfig?: Record<string, string[] | string>;
  skillIds?: string[];
};
type Approval = { id: string; tool: string; args: Record<string, unknown>; status: string; createdAt: string };
type Preset = { id: string; provider: string; name: string; kind: "minimal" | "system" | "custom"; isSystem: boolean; fieldCount: number };
type Provider = { key: string; label: string; initial: string };

// Nền tảng quảng cáo có tool trong MCP server, kèm scope riêng.
const scopeProviders: Provider[] = [
  { key: "meta_ads", label: "Meta Ads", initial: "M" },
  { key: "google_ads", label: "Google Ads", initial: "G" },
  { key: "tiktok_ads", label: "TikTok Ads", initial: "T" },
  { key: "search_console", label: "Search Console", initial: "S" },
  { key: "ga4", label: "Google Analytics 4", initial: "A" },
  { key: "clarity", label: "Microsoft Clarity", initial: "C" },
];
type Skill = { id: string; name: string; enabled: boolean; platforms: string[] };
type CallLog = { id: string; tool: string; ok: boolean; latencyMs: number; createdAt: string; keyId: string; keyName: string };

const input = "w-full rounded-xl border px-3 py-2 text-[13px]";
const STATUS: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  active: { label: "Đang hoạt động", bg: "var(--ok-bg)", color: "var(--ok-ink)", dot: "#22a55b" },
  paused: { label: "Tạm tắt", bg: "var(--warn-bg)", color: "var(--warn-ink)", dot: "var(--warn-ink)" },
  revoked: { label: "Đã thu hồi", bg: "var(--surface-3)", color: "var(--ink-500)", dot: "var(--ink-400)" },
};

function ago(iso?: string) {
  if (!iso) return "chưa dùng";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export function McpKeysClient({ slug, appUrl }: { slug: string; appUrl: string }) {
  const [keys, setKeys] = useState<Key[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [tab, setTab] = useState<"all" | "active" | "paused" | "revoked" | "approvals">("all");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [pickedPresets, setPickedPresets] = useState<Record<string, string>>({});
  const [pickedScopes, setPickedScopes] = useState<Record<string, string>>({});
  const [pickedSkills, setPickedSkills] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [copyTab, setCopyTab] = useState<"url" | "json">("url");
  const [connectMode, setConnectMode] = useState<"oauth" | "apikey">("oauth");
  const [copied, setCopied] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [test, setTest] = useState<{
    id: string;
    loading: boolean;
    ok?: boolean;
    toolCount?: number;
    tools?: string[];
    error?: string;
    text?: string;
  } | null>(null);

  // Gọi endpoint test nội bộ: xác nhận key còn sống + liệt kê tool agent sẽ thấy.
  // Dùng chung một state cho cả dòng trạng thái trong bảng và modal chi tiết.
  async function testKey(id: string) {
    setMenuId(null);
    setTest({ id, loading: true });
    try {
      const res = await fetch(`/api/biz/${slug}/mcp-keys/${id}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const j = await res.json().catch(() => ({}));
      const ok = res.ok && j.ok !== false;
      setTest({
        id,
        loading: false,
        ok,
        toolCount: j.toolCount,
        tools: Array.isArray(j.tools) ? j.tools : [],
        error: ok ? undefined : j.error,
        text: ok
          ? `Key hợp lệ · ${j.toolCount ?? 0} tool khả dụng`
          : j.error === "key_inactive"
            ? "Key đang tắt hoặc đã thu hồi"
            : j.error === "key_expired"
              ? "Key đã hết hạn"
              : (j.error ?? `HTTP ${res.status}`),
      });
    } catch (e: any) {
      setTest({ id, loading: false, ok: false, error: e?.message, text: e?.message ?? "Không gọi được endpoint test" });
    }
  }

  async function load() {
    const [k, a, p, s] = await Promise.all([
      fetch(`/api/biz/${slug}/mcp-keys`).then((r) => r.json()),
      fetch(`/api/biz/${slug}/approvals`).then((r) => r.json()),
      fetch(`/api/biz/${slug}/field-presets`).then((r) => r.json()).catch(() => null),
      fetch(`/api/biz/${slug}/skills`).then((r) => r.json()).catch(() => null),
    ]);
    if (Array.isArray(k)) setKeys(k);
    if (Array.isArray(a)) setApprovals(a);
    if (Array.isArray(p?.presets)) setPresets(p.presets);
    if (Array.isArray(p?.providers)) setProviders(p.providers);
    if (Array.isArray(s)) setSkills(s.filter((x) => x.enabled));
  }
  useEffect(() => {
    load();
  }, [slug]);

  const presetName = useMemo(() => {
    const map = new Map(presets.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? "bộ chỉ số";
  }, [presets]);

  const presetsByProvider = useMemo(() => {
    const map = new Map<string, Preset[]>();
    for (const p of presets) {
      const list = map.get(p.provider) ?? [];
      list.push(p);
      map.set(p.provider, list);
    }
    return map;
  }, [presets]);

  async function create() {
    const res = await fetch(`/api/biz/${slug}/mcp-keys`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        write,
        fieldPresets: pickedPresets,
        skillIds: pickedSkills,
        metaScope: pickedScopes.meta_ads ?? "read",
        googleScope: pickedScopes.google_ads ?? "read",
        tiktokScope: pickedScopes.tiktok_ads ?? "read",
        searchConsoleScope: pickedScopes.search_console ?? "read",
        ga4Scope: pickedScopes.ga4 ?? "read",
        clarityScope: pickedScopes.clarity ?? "read",
      }),
    });
    const j = await res.json();
    if (j.key) {
      setNewKey(j.key);
      setName("");
      setPickedPresets({});
      setPickedScopes({});
      setPickedSkills([]);
      load();
    }
  }

  function openCreate() {
    const seed: Record<string, string> = {};
    for (const p of providers) seed[p.key] = `sys:${p.key}:minimal`;
    setPickedPresets(seed);
    setNewKey("");
    setOpen(true);
  }

  const patch = (id: string, body: Record<string, unknown>) =>
    fetch(`/api/biz/${slug}/mcp-keys/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(load);
  const resolve = (id: string, action: string) =>
    fetch(`/api/biz/${slug}/approvals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).then(load);

  async function openLogs() {
    setLogOpen(true);
    const j = await fetch(`/api/biz/${slug}/mcp-keys/calls?limit=40`)
      .then((r) => r.json())
      .catch(() => ({ items: [] }));
    setLogs(Array.isArray(j.items) ? j.items : []);
  }

  const active = keys.filter((k) => k.status === "active").length;
  const paused = keys.filter((k) => k.status === "paused").length;
  const revoked = keys.filter((k) => k.status === "revoked").length;
  const pending = approvals.filter((a) => a.status === "pending");

  const visible = keys.filter((k) => {
    if (tab === "active" || tab === "paused" || tab === "revoked") {
      if (k.status !== tab) return false;
    }
    if (q) {
      const hay = `${k.name} ${k.keyPrefix}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: "all", label: "Tất cả", count: keys.length },
    { key: "active", label: "Đang hoạt động", count: active },
    { key: "paused", label: "Tạm tắt", count: paused },
    { key: "revoked", label: "Đã thu hồi", count: revoked },
    ...(pending.length > 0 ? [{ key: "approvals" as const, label: "Chờ duyệt", count: pending.length }] : []),
  ];

  const connectorUrl = `${appUrl}/mcp?key=<API_KEY>`;
  // ChatGPT dùng OAuth 2.1: chỉ cần URL server, không cần key.
  const oauthServerUrl = `${appUrl}/mcp`;
  const jsonConfig = `{
  "mcpServers": {
    "adsync": {
      "url": "${connectorUrl}"
    }
  }
}`;

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">API key MCP</h1>
          <p className="ui-sub mt-2">Tạo và quản lý API key để AI (Claude Desktop, Cursor) truy cập hệ thống.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="ui-btn" style={{ height: 38 }} onClick={openLogs}>
            <IconTerminal size={15} />
            Log realtime
          </button>
          <button type="button" className="ui-btn-primary" style={{ height: 38 }} onClick={openCreate}>
            <IconPlus size={15} />
            Tạo key
          </button>
        </div>
      </div>

      <div className="mt-5 grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Danh sách key */}
        <section className="ui-card overflow-hidden p-0">
          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="flex items-center gap-1">
              {tabs.map((t) => {
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[13px] font-medium transition-colors"
                    style={on ? { background: "var(--surface-3)", color: "var(--ink-900)" } : { color: "var(--ink-500)" }}
                  >
                    {t.label}
                    <span
                      className="rounded-full px-1.5 text-[11px] font-semibold"
                      style={{ background: on ? "var(--surface-3)" : "var(--surface-3)", color: "var(--ink-500)" }}
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="relative ml-auto block w-[228px]">
              <IconSearch
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--ink-400)" }}
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên hoặc tiền tố"
                className="h-9 w-full rounded-xl border bg-[var(--card)] pl-9 pr-3 text-[13px] outline-none focus:ring-2"
                style={{ borderColor: "var(--line)" }}
              />
            </label>
          </div>

          {tab === "approvals" ? (
            <div className="px-4 py-3">
              {approvals.length === 0 ? (
                <p className="py-8 text-center text-[13px]" style={{ color: "var(--ink-400)" }}>
                  Chưa có yêu cầu ghi nào.
                </p>
              ) : (
                <ul className="space-y-2">
                  {approvals.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium" style={{ color: "var(--ink-800)" }}>
                          {a.tool}
                        </div>
                        <div className="truncate font-mono text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                          {JSON.stringify(a.args)}
                        </div>
                        <div className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                          {new Date(a.createdAt).toLocaleString("vi-VN")}
                        </div>
                      </div>
                      {a.status === "pending" ? (
                        <div className="flex shrink-0 gap-2">
                          <button type="button" className="ui-btn-primary" onClick={() => resolve(a.id, "approve")}>
                            Duyệt &amp; chạy
                          </button>
                          <button type="button" className="ui-btn" onClick={() => resolve(a.id, "reject")}>
                            Từ chối
                          </button>
                        </div>
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--ink-500)" }}>
                          {a.status}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <table className="ui-table w-full table-fixed">
              <thead>
                <tr>
                  <th>Tên key</th>
                  <th style={{ width: 160 }}>Quyền</th>
                  <th style={{ width: 112 }}>Dùng lần cuối</th>
                  <th style={{ width: 100 }}>Trạng thái</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-[13px]" style={{ color: "var(--ink-400)" }}>
                      Chưa có key nào. Bấm “Tạo key” để bắt đầu.
                    </td>
                  </tr>
                )}
                {visible.map((k) => {
                  const st = STATUS[k.status] ?? STATUS.revoked;
                  const gazette: { label: string }[] =
                    providers.length > 0
                      ? providers.slice(0, 5).map((p) => ({
                          label: `${p.label}: ${k.fieldPresets?.[p.key] ? presetName(k.fieldPresets[p.key]) : "Toàn bộ"}`,
                        }))
                      : [
                          { label: "Facebook Ads: Toàn bộ" },
                          { label: "Facebook Page: Toàn bộ" },
                          { label: "TikTok Ads: Toàn bộ" },
                          { label: "Google Ads: Toàn bộ" },
                        ];
                  const permChips =
                    Object.keys(k.fieldPresets ?? {}).length > 0
                      ? Object.entries(k.fieldPresets ?? {}).map(([provider, id]) => ({
                          label: `${providers.find((p) => p.key === provider)?.label ?? provider}: ${presetName(id)}`,
                        }))
                      : gazette;
                  const entityCount = Object.keys(k.fieldConfig ?? {}).length;
                  return (
                    <tr key={k.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                          >
                            <IconKey size={16} />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
                              {k.name}
                            </div>
                            <div className="truncate font-mono text-[12px]" style={{ color: "var(--ink-400)" }}>
                              {k.keyPrefix}… · {k.callCount} calls
                            </div>
                            {test?.id === k.id && (
                              <div
                                className="mt-1 truncate text-[11.5px] font-medium"
                                style={{ color: test.loading ? "var(--ink-400)" : test.ok ? "var(--ok-ink)" : "var(--danger-ink)" }}
                              >
                                {test.loading ? "Đang kiểm tra…" : test.text}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          {permChips.slice(0, 5).map((c) => (
                            <span
                              key={c.label}
                              className="whitespace-nowrap rounded-full px-2 py-[3px] text-[11.5px] font-medium"
                              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                            >
                              {c.label}
                            </span>
                          ))}
                          {permChips.length > 5 && (
                            <span className="text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                              +{permChips.length - 5}
                            </span>
                          )}
                          {k.scopes.write === "true" && (
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[11.5px] font-medium"
                              style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
                            >
                              Write: có duyệt
                            </span>
                          )}
                          {entityCount > 0 && (
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[11.5px] font-medium"
                              style={{ background: "var(--surface-3)", color: "var(--ink-500)" }}
                            >
                              {entityCount} loại dữ liệu
                            </span>
                          )}
                          {(k.skillIds?.length ?? 0) > 0 && (
                            <span
                              className="rounded-md px-1.5 py-0.5 text-[11.5px] font-medium"
                              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                            >
                              {k.skillIds!.length} skill
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-[13px]" style={{ color: "var(--ink-600)" }}>
                          {ago(k.lastUsedAt)}
                        </div>
                        <div className="text-[12px]" style={{ color: "var(--ink-400)" }}>
                          Tạo {new Date(k.createdAt).toLocaleDateString("vi-VN")}
                        </div>
                      </td>
                      <td>
                        <span
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold"
                          style={{ background: st.bg, color: st.color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.dot }} />
                          {st.label}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="relative inline-block">
                          <button
                            type="button"
                            aria-label="Thao tác"
                            onClick={() => setMenuId(menuId === k.id ? null : k.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-3)]"
                            style={{ color: "var(--ink-400)" }}
                          >
                            <IconMore size={18} />
                          </button>
                          {menuId === k.id && (
                            <>
                              <span className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                              <span
                                className="absolute right-0 top-9 z-20 w-[150px] overflow-hidden rounded-xl border bg-[var(--card)] py-1 text-left"
                                style={{ borderColor: "var(--line)", boxShadow: "0 12px 28px -12px rgba(13,27,42,.28)" }}
                              >
                                <button
                                  type="button"
                                  onClick={() => testKey(k.id)}
                                  className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)]"
                                  style={{ color: "var(--ink-700)" }}
                                >
                                  Kiểm tra key
                                </button>
                                <button
                                  type="button"
                                  onClick={() => testKey(k.id)}
                                  className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)]"
                                  style={{ color: "var(--ink-700)" }}
                                >
                                  Kiểm tra key
                                </button>
                                {k.status === "active" ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      patch(k.id, { status: "paused" });
                                      setMenuId(null);
                                    }}
                                    className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)]"
                                    style={{ color: "var(--ink-700)" }}
                                  >
                                    Tạm tắt
                                  </button>
                                ) : k.status === "paused" ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      patch(k.id, { status: "active" });
                                      setMenuId(null);
                                    }}
                                    className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)]"
                                    style={{ color: "var(--ink-700)" }}
                                  >
                                    Bật lại
                                  </button>
                                ) : null}
                                {k.status !== "revoked" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      patch(k.id, { status: "revoked" });
                                      setMenuId(null);
                                    }}
                                    className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-3)]"
                                    style={{ color: "var(--ink-700)" }}
                                  >
                                    Thu hồi
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    fetch(`/api/biz/${slug}/mcp-keys/${k.id}`, { method: "DELETE" }).then(load);
                                    setMenuId(null);
                                  }}
                                  className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--danger-bg)]"
                                  style={{ color: "var(--danger-ink)" }}
                                >
                                  Xoá
                                </button>
                              </span>
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div className="px-5 py-3 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
            Bấm menu ⋯ trên mỗi dòng để tạm tắt, thu hồi hoặc xoá key. Key chỉ hiển thị đầy đủ một lần ngay sau khi tạo.
          </div>
        </section>

        {/* Hướng dẫn kết nối */}
        <aside className="ui-card p-4">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              <IconInfo size={15} />
            </span>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
              Kết nối AI với hệ thống
            </h2>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "var(--ink-500)" }}>
            Hai cách để AI gọi được dữ liệu của bạn: OAuth cho ChatGPT, API key cho Claude Desktop, Cursor.
          </p>

          <div className="mt-3 flex gap-1 rounded-lg p-0.5" style={{ background: "var(--surface-3)" }}>
            {(
              [
                ["oauth", "ChatGPT (OAuth)"],
                ["apikey", "Claude / Cursor"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setConnectMode(k)}
                className="flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium"
                style={
                  connectMode === k
                    ? { background: "var(--card)", color: "var(--ink-900)", boxShadow: "0 1px 2px rgba(13,27,42,.08)" }
                    : { color: "var(--ink-500)" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {connectMode === "oauth" ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                <div className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
                  1. Trong ChatGPT
                </div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-500)" }}>
                  Settings → Apps &amp; connectors → New connector → MCP. Dán URL server rồi bấm "Connect".
                </p>
                <div className="mt-2 flex items-center justify-between rounded-lg border px-2.5 py-1.5" style={{ borderColor: "var(--line)" }}>
                  <span className="text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                    MCP Server URL
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium"
                    style={{ borderColor: "var(--line-strong)", color: "var(--ink-700)" }}
                    onClick={() => copyText(oauthServerUrl)}
                  >
                    {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    {copied ? "Đã chép" : "Sao chép"}
                  </button>
                </div>
                <pre className="mt-1.5 break-all font-mono text-[11.5px]" style={{ color: "var(--brand)" }}>
                  {oauthServerUrl}
                </pre>
              </div>

              <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                <div className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
                  2. Duyệt trong trình duyệt
                </div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-500)" }}>
                  AdsSync mở màn chọn API key MCP, bạn chọn key và bấm "Cấp quyền". Sau đó quay lại ChatGPT là AI dùng được.
                </p>
              </div>

              <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
                <div className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
                  3. Quyền ghi vẫn cần bạn duyệt
                </div>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-500)" }}>
                  AI được cấp quyền đọc ngay. Lệnh ghi (tắt ads, đổi ngân sách, đăng bài) tạo yêu cầu chờ duyệt ở tab "Chờ duyệt" — bạn chỉ cần bấm duyệt.
                </p>
                <Link href={`/biz/${slug}/dashboard/mcp-keys`} className="ui-btn mt-2">
                  Xem yêu cầu chờ duyệt
                </Link>
              </div>
            </div>
          ) : (
            <ol className="mt-4 space-y-4">
            <li className="relative pl-8">
              <span
                className="absolute left-0 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                1
              </span>
              <div className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
                Tạo API key
              </div>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-500)" }}>
                Chọn nền tảng và quyền cho key. Key chỉ hiện <strong>một lần</strong> ngay sau khi tạo.
              </p>
              <button type="button" className="ui-btn mt-2" onClick={openCreate}>
                <IconPlus size={14} />
                Tạo key
              </button>
            </li>

            <li className="relative pl-8">
              <span
                className="absolute left-0 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                2
              </span>
              <div className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
                Sao chép thông tin kết nối
              </div>

              <div className="mt-2 flex gap-1 rounded-lg p-0.5" style={{ background: "var(--surface-3)" }}>
                {(
                  [
                    ["url", "Connector URL"],
                    ["json", "Cấu hình JSON"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCopyTab(k)}
                    className="flex-1 rounded-md px-2 py-1 text-[12px] font-medium"
                    style={
                      copyTab === k
                        ? { background: "var(--card)", color: "var(--ink-900)", boxShadow: "0 1px 2px rgba(13,27,42,.08)" }
                        : { color: "var(--ink-500)" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-2 rounded-xl border p-2.5" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                    {copyTab === "url" ? "Connector URL" : "MCP config"}
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium"
                    style={{ borderColor: "var(--line-strong)", color: "var(--ink-700)" }}
                    onClick={() => copyText(copyTab === "url" ? connectorUrl : jsonConfig)}
                  >
                    {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    {copied ? "Đã chép" : "Sao chép"}
                  </button>
                </div>
                <pre
                  className="mt-1.5 max-h-[120px] overflow-auto whitespace-pre-wrap break-all font-mono text-[11.5px]"
                  style={{ color: "var(--brand)" }}
                >
                  {copyTab === "url" ? connectorUrl : jsonConfig}
                </pre>
              </div>
              <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                Thay <code>&lt;API_KEY&gt;</code> bằng key vừa tạo.
              </p>
            </li>

            <li className="relative pl-8">
              <span
                className="absolute left-0 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: "var(--brand)" }}
              >
                3
              </span>
              <div className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>
                Dán vào AI client
              </div>
              <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--ink-500)" }}>
                Claude Desktop &gt; Connectors &gt; Add, hoặc dán cấu hình JSON vào client dùng file{" "}
                <code className="rounded bg-[var(--surface-3)] px-1">claude_desktop_config.json</code>.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href={`/biz/${slug}/dashboard/mcp-keys/field-presets`} className="ui-btn">
                  Bộ chỉ số
                </Link>
                <Link href={`/biz/${slug}/dashboard/mcp-keys/skills`} className="ui-btn">
                  Skill Hub
                </Link>
              </div>
            </li>
            </ol>
          )}
        </aside>
      </div>

      {/* Log realtime */}
      <Dialog.Root open={logOpen} onOpenChange={setLogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[min(680px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-[var(--card)] p-5 shadow-xl">
            <Dialog.Title className="text-[17px] font-bold" style={{ color: "var(--ink-900)" }}>
              Log gọi MCP
            </Dialog.Title>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
              40 lượt gọi gần nhất. Log giúp kiểm tra AI client đã kết nối đúng chưa.
            </p>
            <table className="ui-table mt-3 w-full">
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Key</th>
                  <th>Tool</th>
                  <th style={{ width: 90 }}>Kết quả</th>
                  <th style={{ width: 80 }} className="text-right">
                    ms
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[13px]" style={{ color: "var(--ink-400)" }}>
                      Chưa có lượt gọi nào.
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <tr key={l.id}>
                      <td className="text-[12.5px]" style={{ color: "var(--ink-600)" }}>
                        {new Date(l.createdAt).toLocaleString("vi-VN")}
                      </td>
                      <td className="truncate text-[12.5px]" style={{ color: "var(--ink-700)" }}>
                        {l.keyName}
                      </td>
                      <td className="font-mono text-[12px]" style={{ color: "var(--ink-700)" }}>
                        {l.tool}
                      </td>
                      <td>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                          style={
                            l.ok ? { background: "var(--ok-bg)", color: "var(--ok-ink)" } : { background: "var(--danger-bg)", color: "var(--danger-ink)" }
                          }
                        >
                          {l.ok ? "OK" : "Lỗi"}
                        </span>
                      </td>
                      <td className="text-right text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                        {l.latencyMs}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="mt-3 flex justify-end">
              <Dialog.Close className="ui-btn">Đóng</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Tạo key */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[18px] bg-[var(--card)] p-6 shadow-xl">
            <Dialog.Title className="mb-4 text-[18px] font-bold" style={{ color: "var(--ink-900)" }}>
              Tạo MCP key
            </Dialog.Title>
            {newKey ? (
              <div>
                <p className="mb-2 text-[13px]" style={{ color: "var(--warn-ink)" }}>
                  Key chỉ hiển thị 1 lần — sao chép ngay:
                </p>
                <div className="break-all rounded-xl bg-[var(--surface-3)] p-3 font-mono text-[12px]" style={{ color: "var(--ink-800)" }}>
                  {newKey}
                </div>
                <div className="mt-3 rounded-xl bg-[var(--surface-2)] p-3 text-[12px]" style={{ color: "var(--ink-600)" }}>
                  MCP URL:
                  <br />
                  <span className="font-mono">
                    {appUrl}/mcp?key={newKey.slice(0, 10)}…
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(newKey);
                    setOpen(false);
                  }}
                  className="ui-btn-primary mt-4 w-full"
                >
                  Sao chép &amp; đóng
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                    Tên key *
                  </span>
                  <input
                    className={input}
                    style={{ borderColor: "var(--line-strong)" }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="VD: Claude Desktop — máy anh"
                  />
                </label>
                <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-700)" }}>
                  <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
                  Cho phép write tools (pause/resume/budget — qua duyệt)
                </label>

                <div>
                  <span className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                    Quyền theo nền tảng
                  </span>
                  <p className="mb-2 text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                    AI chỉ thấy tool của nền tảng được cấp quyền. "Toàn quyền" = gồm cả thao tác ghi.
                  </p>
                  <div className="space-y-1.5 rounded-xl border p-2" style={{ borderColor: "var(--line)" }}>
                    {scopeProviders.map((p) => (
                      <label key={p.key} className="flex items-center gap-2">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                        >
                          {p.initial}
                        </span>
                        <span className="flex-1 truncate text-[12px]" style={{ color: "var(--ink-600)" }}>
                          {p.label}
                        </span>
                        <select
                          className={input}
                          style={{ borderColor: "var(--line-strong)" }}
                          value={pickedScopes[p.key] ?? "read"}
                          onChange={(e) =>
                            setPickedScopes((prev) => ({ ...prev, [p.key]: e.target.value }))
                          }
                        >
                          <option value="read">Chỉ đọc</option>
                          <option value="all">Toàn quyền</option>
                          <option value="none">Tắt</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                      Bộ chỉ số theo nền tảng
                    </span>
                    <Link
                      href={`/biz/${slug}/dashboard/mcp-keys/field-presets`}
                      className="text-[12px] font-medium"
                      style={{ color: "var(--brand)" }}
                    >
                      Quản lý
                    </Link>
                  </div>
                  <p className="mb-2 text-[11.5px]" style={{ color: "var(--ink-500)" }}>
                    Bộ chỉ số được sao chép vào key ngay lúc tạo — sửa bộ gốc sau đó không ảnh hưởng key.
                  </p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border p-2" style={{ borderColor: "var(--line)" }}>
                    {providers.map((p) => (
                      <label key={p.key} className="flex items-center gap-2">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                        >
                          {p.initial}
                        </span>
                        <span className="w-24 shrink-0 truncate text-[12px]" style={{ color: "var(--ink-600)" }}>
                          {p.label}
                        </span>
                        <select
                          className={input}
                          style={{ borderColor: "var(--line-strong)" }}
                          value={pickedPresets[p.key] ?? ""}
                          onChange={(e) =>
                            setPickedPresets((prev) => {
                              const next = { ...prev };
                              if (e.target.value) next[p.key] = e.target.value;
                              else delete next[p.key];
                              return next;
                            })
                          }
                        >
                          <option value="">Không lọc (toàn bộ field)</option>
                          {(presetsByProvider.get(p.key) ?? []).map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {preset.name}
                              {preset.kind === "custom" ? " (của bạn)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>

                {skills.length > 0 && (
                  <div>
                    <span className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--ink-600)" }}>
                      Skill gắn vào key
                    </span>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border p-2" style={{ borderColor: "var(--line)" }}>
                      {skills.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-700)" }}>
                          <input
                            type="checkbox"
                            checked={pickedSkills.includes(s.id)}
                            onChange={() =>
                              setPickedSkills((prev) =>
                                prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                              )
                            }
                          />
                          {s.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Dialog.Close className="ui-btn">Huỷ</Dialog.Close>
                  <button type="button" onClick={create} disabled={!name} className="ui-btn-primary disabled:opacity-50">
                    Tạo
                  </button>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {test && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setTest(null)}
        >
          <div className="ui-card w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold" style={{ color: "var(--ink-900)" }}>
                Kiểm tra key
              </h3>
              <button
                type="button"
                onClick={() => setTest(null)}
                className="rounded-lg px-2 py-1 text-[12px]"
                style={{ color: "var(--ink-500)" }}
              >
                Đóng
              </button>
            </div>

            {test.loading ? (
              <p className="mt-3 text-[13px]" style={{ color: "var(--ink-500)" }}>
                Đang gọi MCP server…
              </p>
            ) : test.ok ? (
              <>
                <p className="mt-3 text-[13px]" style={{ color: "var(--ok-ink)" }}>
                  Key hợp lệ · agent sẽ thấy {test.toolCount ?? 0} tool.
                </p>
                <div className="mt-3 flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
                  {(test.tools ?? []).map((t) => (
                    <span
                      key={t}
                      className="rounded-md px-2 py-1 font-mono text-[11.5px]"
                      style={{ background: "var(--surface-3)", color: "var(--ink-600)" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-[13px]" style={{ color: "var(--danger-ink)" }}>
                {test.error === "key_inactive" || test.error === "key_expired"
                  ? "Key đang tắt hoặc đã hết hạn — bật lại trước khi dùng."
                  : `Không dùng được key: ${test.error ?? "unknown_error"}`}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

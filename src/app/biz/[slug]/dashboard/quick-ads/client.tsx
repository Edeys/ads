"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconLayers, IconRefresh } from "../icons";

type Conn = { id: string; name: string; meta: Record<string, unknown> };
type Tpl = { id: string; name: string; objective: string; destination: string; dailyBudget: number };
type Post = { id: string; message?: string; created_time?: string; permalink_url?: string };

const fieldCls =
  "h-11 w-full rounded-xl border bg-[var(--card)] px-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[var(--brand)]/20";
const labelCls = "mb-1.5 block text-[13px] font-semibold";

export function QuickAdsClient({
  slug,
  connections,
  templates,
  realWrites,
}: {
  slug: string;
  connections: Conn[];
  templates: Tpl[];
  realWrites: boolean;
}) {
  const router = useRouter();
  const [credentialId, setCredentialId] = useState("");
  const [pageId, setPageId] = useState("");
  const [adAccountId, setAdAccountId] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [postId, setPostId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [saveAs, setSaveAs] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState<{ campaignId: string; mocked?: boolean } | null>(null);

  const conn = connections.find((c) => c.id === credentialId);
  const pages = (conn?.meta?.pages as { id: string; name: string }[] | undefined) ?? [];
  const adAccounts = (conn?.meta?.adAccounts as { id: string; name: string }[] | undefined) ?? [];
  const tpl = templates.find((t) => t.id === templateId);
  const post = posts.find((p) => p.id === postId);

  async function scan() {
    setBusy(true);
    setPosts([]);
    setMsg("");
    const res = await fetch(`/api/biz/${slug}/meta/entities?conn=${credentialId}&acc=${pageId}&level=posts`);
    const j = await res.json();
    setBusy(false);
    if (Array.isArray(j)) setPosts(j);
    else setMsg(j.error ?? "Không quét được bài viết");
  }

  async function create() {
    setBusy(true);
    setMsg("");
    setResult(null);
    const res = await fetch(`/api/biz/${slug}/quick-ads`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ credentialId, adAccountId, pageId, postId, templateId, saveAs: saveAs || undefined }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(j.error ?? "Lỗi");
      return;
    }
    setResult(j);
    setMsg(
      j.mocked
        ? `Đã mô phỏng campaign ${j.campaignId} (PAUSED) — chưa gửi lệnh lên Meta.`
        : `Đã tạo campaign ${j.campaignId} (PAUSED) — vào Ads Manager bật khi duyệt xong.`,
    );
    router.refresh();
  }

  const canPublish = Boolean(postId && templateId && adAccountId && !busy);

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="ui-h1">Đăng quảng cáo nhanh</h1>
          <p className="ui-sub mt-2 max-w-[720px]">
            Chọn bài viết từ trang Facebook và tạo quảng cáo với mẫu có sẵn.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className="ui-chip"
            style={
              realWrites
                ? { background: "var(--warn-bg)", color: "var(--warn-ink)" }
                : { background: "var(--brand-soft)", color: "var(--brand)" }
            }
          >
            {realWrites ? "Chế độ thật (có kiểm duyệt)" : "Chế độ mô phỏng"}
          </span>
          <Link href={`/biz/${slug}/dashboard/quick-ads/templates`} className="ui-btn" style={{ height: 38 }}>
            Mẫu đã lưu
          </Link>
        </div>
      </div>

      <section className="ui-card mt-4 p-0">
        {/* Bộ chọn nguồn */}
        <div className="flex flex-wrap items-end gap-4 px-5 pt-4">
          <label className="block w-[212px]">
            <span className={labelCls} style={{ color: "var(--ink-900)" }}>
              Kết nối Meta
            </span>
            <select
              className={fieldCls}
              style={{ borderColor: "var(--line-strong)", color: credentialId ? "var(--ink-900)" : "var(--ink-400)" }}
              value={credentialId}
              onChange={(e) => {
                setCredentialId(e.target.value);
                setPageId("");
                setAdAccountId("");
                setPosts([]);
                setPostId("");
              }}
            >
              <option value="">Chọn tài khoản Facebook</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block w-[264px]">
            <span className={labelCls} style={{ color: "var(--ink-900)" }}>
              Chọn trang
            </span>
            <select
              className={fieldCls}
              style={{ borderColor: "var(--line-strong)", color: pageId ? "var(--ink-900)" : "var(--ink-400)" }}
              value={pageId}
              onChange={(e) => {
                setPageId(e.target.value);
                setPostId("");
                setPosts([]);
              }}
              disabled={!credentialId}
            >
              <option value="">Chọn trang Facebook</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block w-[212px]">
            <span className={labelCls} style={{ color: "var(--ink-900)" }}>
              Tài khoản quảng cáo
            </span>
            <select
              className={fieldCls}
              style={{ borderColor: "var(--line-strong)", color: adAccountId ? "var(--ink-900)" : "var(--ink-400)" }}
              value={adAccountId}
              onChange={(e) => setAdAccountId(e.target.value)}
              disabled={!credentialId}
            >
              <option value="">Chọn tài khoản QC</option>
              {adAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.id})
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={scan}
            disabled={busy || !pageId}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-[13.5px] font-medium disabled:opacity-40"
            style={{ color: "var(--ink-700)" }}
          >
            <IconRefresh size={15} style={{ color: "var(--ink-500)" }} />
            {busy ? "Đang quét…" : "Quét bài viết"}
          </button>
        </div>

        {/* Nội dung */}
        {!pageId ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border"
              style={{ borderColor: "var(--line)", background: "var(--surface-3)", color: "var(--brand)" }}
            >
              <IconLayers size={22} />
            </span>
            <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              Chưa chọn trang
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-500)" }}>
              Chọn tài khoản Facebook và một trang ở trên để bắt đầu.
            </p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border"
              style={{ borderColor: "var(--line)", background: "var(--surface-3)", color: "var(--brand)" }}
            >
              <IconRefresh size={22} />
            </span>
            <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              Chưa quét bài viết
            </p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--ink-500)" }}>
              Bấm “Quét bài viết” để tải bài gần nhất của trang đã chọn.
            </p>
            <button type="button" onClick={scan} disabled={busy} className="ui-btn mt-3">
              {busy ? "Đang quét…" : "Quét bài viết"}
            </button>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <div className="mt-4 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--ink-900)" }}>
                Chọn bài viết
              </h2>
              <span className="text-[12px]" style={{ color: "var(--ink-400)" }}>
                {posts.length} bài
              </span>
            </div>

            <div className="ui-scroll mt-2 grid max-h-[300px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {posts.map((p) => {
                const on = postId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPostId(p.id)}
                    className="rounded-xl border px-3 py-2.5 text-left transition-colors"
                    style={
                      on
                        ? { borderColor: "var(--brand)", background: "var(--brand-soft)", boxShadow: "inset 0 0 0 1px var(--brand)" }
                        : { borderColor: "var(--line)" }
                    }
                  >
                    <div className="line-clamp-2 text-[13px]" style={{ color: "var(--ink-800)" }}>
                      {p.message ?? <i style={{ color: "var(--ink-400)" }}>(không có nội dung)</i>}
                    </div>
                    <div className="mt-1 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                      {p.created_time ? new Date(p.created_time).toLocaleString("vi-VN") : ""}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-4 border-t pt-4 lg:grid-cols-[1.1fr_1fr]" style={{ borderColor: "var(--line)" }}>
              <div className="rounded-xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--row-hover)" }}>
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
                  Xem trước
                </div>
                <p className="mt-1 line-clamp-3 text-[13px]" style={{ color: "var(--ink-700)" }}>
                  {post?.message ?? "Chưa chọn bài viết"}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                  <div>
                    <div style={{ color: "var(--ink-400)" }}>Mục tiêu</div>
                    <div className="font-medium" style={{ color: "var(--ink-800)" }}>
                      {tpl?.objective ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ink-400)" }}>Vị trí</div>
                    <div className="font-medium" style={{ color: "var(--ink-800)" }}>
                      {tpl?.destination ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ink-400)" }}>Ngân sách/ngày</div>
                    <div className="font-medium" style={{ color: "var(--ink-800)" }}>
                      {tpl ? `${tpl.dailyBudget.toLocaleString("vi-VN")}₫` : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--ink-400)" }}>Trạng thái tạo</div>
                    <div className="font-medium" style={{ color: "var(--ink-800)" }}>
                      PAUSED
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block">
                  <span className={labelCls} style={{ color: "var(--ink-900)" }}>
                    Mẫu quảng cáo
                  </span>
                  <select
                    className={fieldCls}
                    style={{ borderColor: "var(--line-strong)", color: templateId ? "var(--ink-900)" : "var(--ink-400)" }}
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    <option value="">Chọn mẫu quảng cáo</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.dailyBudget.toLocaleString("vi-VN")}₫
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-3 block">
                  <span className={labelCls} style={{ color: "var(--ink-900)" }}>
                    Lưu thành mẫu mới (tuỳ chọn)
                  </span>
                  <input
                    className={fieldCls}
                    style={{ borderColor: "var(--line-strong)" }}
                    value={saveAs}
                    onChange={(e) => setSaveAs(e.target.value)}
                    placeholder="VD: Mẫu sale tháng 11"
                  />
                </label>

                <button
                  type="button"
                  onClick={create}
                  disabled={!canPublish}
                  className="ui-btn-primary mt-3 w-full disabled:opacity-50"
                  style={{ height: 40 }}
                >
                  {busy ? "Đang tạo…" : realWrites ? "Tạo campaign (cần duyệt)" : "Mô phỏng tạo campaign"}
                </button>
                <p className="mt-2 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                  Campaign luôn tạo ở trạng thái PAUSED. Bản local không gửi lệnh ghi lên tài khoản thật.
                </p>

                {msg && (
                  <div
                    className="mt-2 rounded-xl px-3 py-2.5 text-[12.5px]"
                    style={
                      result
                        ? { background: "var(--ok-bg, #e9f8ef)", color: "var(--ok-ink)" }
                        : { background: "var(--danger-bg)", color: "var(--danger-ink)" }
                    }
                  >
                    {msg}
                    {result && (
                      <div className="mt-1 text-[11.5px] opacity-80">
                        campaign: {result.campaignId}
                        {result.mocked ? " · mô phỏng" : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

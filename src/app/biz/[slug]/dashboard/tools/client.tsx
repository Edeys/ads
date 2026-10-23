"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";

export type ToolRow = {
  id: string;
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyTemplate: string | null;
  secretRef: string | null;
  requiresApproval: boolean;
  enabled: boolean;
  timeoutMs: number;
  createdAt: string;
};

export type RunRow = {
  id: string;
  status: string;
  objectId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

const EXAMPLE_SCHEMA = JSON.stringify(
  { type: "object", properties: { keyword: { type: "string", description: "Từ khoá cần tra" } }, required: ["keyword"] },
  null,
  2,
);

const input = "w-full rounded-xl border px-3 py-2 text-[13px] outline-none";

export function ToolsClient({
  slug,
  canManage,
  tools,
  runs,
}: {
  slug: string;
  canManage: boolean;
  tools: ToolRow[];
  runs: RunRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(t: ToolRow) {
    setBusyId(t.id);
    await fetch(`/api/biz/${slug}/custom-tools/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    setBusyId(null);
    router.refresh();
  }

  async function remove(t: ToolRow) {
    if (!confirm(`Xoá tool "${t.name}"?`)) return;
    setBusyId(t.id);
    await fetch(`/api/biz/${slug}/custom-tools/${t.id}`, { method: "DELETE" });
    setBusyId(null);
    router.refresh();
  }

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="ui-h1">Custom tools</h1>
          <p className="ui-sub mt-2 max-w-[720px]">
            Khai báo tool HTTP bằng manifest để AI gọi được qua MCP. Tool có side effect mặc định phải qua
            Approval Gate trước khi chạy. Host nội bộ (localhost, 192.168.x, metadata cloud) bị chặn mặc định
            để tránh SSRF; đặt <code className="rounded bg-[var(--surface-3)] px-1">ADSYNC_ALLOW_PRIVATE_TOOLS=1</code>{" "}
            nếu thật sự cần gọi dịch vụ nội bộ.
          </p>
        </div>
        {canManage && (
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="ui-btn-primary shrink-0" style={{ height: 38 }}>
              <IconPlus size={15} />
              Thêm tool
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgba(13,27,42,.35)]" />
              <Dialog.Content
                className="fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[min(620px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-[var(--card)] p-5 shadow-xl"
                aria-describedby={undefined}
              >
                <Dialog.Title className="text-[16px] font-bold" style={{ color: "var(--ink-900)" }}>
                  Thêm custom tool
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                  Tool là một endpoint HTTP. Dùng {"{{ten_tham_so}}"} trong URL/header/body để nội suy tham số.
                </Dialog.Description>
                <ToolForm
                  slug={slug}
                  onDone={() => {
                    setOpen(false);
                    router.refresh();
                  }}
                />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
      </div>

      <section className="ui-card mt-4 overflow-hidden p-0">
        {tools.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border"
              style={{ borderColor: "var(--line)", background: "var(--surface-3)", color: "var(--brand)" }}
            >
              <IconTool size={24} />
            </span>
            <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              Chưa có custom tool nào
            </p>
            <p className="mt-1 max-w-[420px] text-[13px]" style={{ color: "var(--ink-500)" }}>
              Thêm một endpoint HTTP (CRM, bảng tính, webhook nội bộ…) để AI dùng chung với các tool quảng cáo
              có sẵn.
            </p>
            {canManage && (
              <button type="button" onClick={() => setOpen(true)} className="ui-btn mt-3">
                <IconPlus size={14} />
                Thêm tool
              </button>
            )}
          </div>
        ) : (
          <div>
            {tools.map((t) => (
              <ToolCard
                key={t.id}
                slug={slug}
                tool={t}
                canManage={canManage}
                busy={busyId === t.id}
                onToggle={() => toggle(t)}
                onRemove={() => remove(t)}
              />
            ))}
            <p className="border-t px-5 py-3 text-[12px]" style={{ borderColor: "var(--line)", color: "var(--ink-400)" }}>
              Tool hiển thị cho mọi API key MCP đang hoạt động của Biz. Tool có side effect trả về
              <span className="mx-1 rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[11px]">pending_approval</span>
              và chờ owner duyệt.
            </p>
          </div>
        )}
      </section>

      {runs.length > 0 && (
        <section className="ui-card ui-card-pad mt-3">
          <h2 className="ui-h2">Lần chạy gần đây</h2>
          <p className="ui-sub mt-1">20 lượt chạy thử gần nhất, lấy từ nhật ký hoạt động.</p>
          <table className="ui-table mt-2 w-full">
            <thead>
              <tr>
                <th>Tool</th>
                <th style={{ width: 90 }}>Kết quả</th>
                <th style={{ width: 80 }}>HTTP</th>
                <th style={{ width: 100 }}>Thời gian</th>
                <th style={{ width: 170 }}>Lúc</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const tool = tools.find((t) => t.id === r.objectId);
                const name = typeof r.detail.name === "string" ? r.detail.name : tool?.name ?? "—";
                const httpStatus = typeof r.detail.status === "number" ? r.detail.status : null;
                const ms = typeof r.detail.ms === "number" ? r.detail.ms : null;
                const ok = r.status === "success";
                return (
                  <tr key={r.id}>
                    <td className="text-[12.5px] font-medium" style={{ color: "var(--ink-800)" }}>
                      {name}
                    </td>
                    <td>
                      <span
                        className="ui-chip"
                        style={
                          ok
                            ? { background: "var(--ok-bg)", color: "var(--ok-ink)" }
                            : { background: "var(--danger-bg)", color: "var(--danger-ink)" }
                        }
                      >
                        {ok ? "OK" : "Lỗi"}
                      </span>
                    </td>
                    <td className="text-[12.5px]" style={{ color: "var(--ink-600)" }}>
                      {httpStatus ?? "—"}
                    </td>
                    <td className="text-[12.5px]" style={{ color: "var(--ink-600)" }}>
                      {ms === null ? "—" : `${ms} ms`}
                    </td>
                    <td className="text-[12px]" style={{ color: "var(--ink-500)" }}>
                      {new Date(r.createdAt).toLocaleString("vi-VN", { hour12: false })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function ToolCard({
  slug,
  tool,
  canManage,
  busy,
  onToggle,
  onRemove,
}: {
  slug: string;
  tool: ToolRow;
  canManage: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [runOpen, setRunOpen] = useState(false);
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState<{ ok: boolean; status: number; ms: number; data: unknown } | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(args || "{}");
    } catch {
      setRunning(false);
      setError("args phải là JSON hợp lệ");
      return;
    }
    const res = await fetch(`/api/biz/${slug}/custom-tools/${tool.id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: parsed }),
    });
    const data = await res.json().catch(() => ({}));
    setRunning(false);
    if (!res.ok) {
      setError(data?.error ?? `lỗi HTTP ${res.status}`);
      return;
    }
    setResult(data);
  }

  return (
    <div className="border-t px-5 py-3.5 first:border-t-0" style={{ borderColor: "var(--line)" }}>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: "var(--line)", background: "var(--surface-3)", color: "var(--brand)" }}
        >
          <IconTool size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
              {tool.name}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
            >
              {tool.method}
            </span>
            {tool.requiresApproval && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}
              >
                cần duyệt
              </span>
            )}
            {!tool.enabled && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--surface-3)", color: "var(--ink-500)" }}
              >
                đang tắt
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px]" style={{ color: "var(--ink-400)" }}>
            {tool.url}
          </div>
          {tool.description && (
            <p className="mt-1 max-w-[640px] text-[12.5px]" style={{ color: "var(--ink-600)" }}>
              {tool.description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setRunOpen((v) => !v)} className="ui-btn" style={{ height: 32 }}>
            Chạy thử
          </button>
          {canManage && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onToggle}
                className="text-[12.5px] font-medium hover:underline disabled:opacity-50"
                style={{ color: "var(--ink-600)" }}
              >
                {tool.enabled ? "Tắt" : "Bật"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                className="text-[12.5px] font-medium hover:underline disabled:opacity-50"
                style={{ color: "var(--danger-ink)" }}
              >
                Xoá
              </button>
            </>
          )}
        </div>
      </div>

      {runOpen && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--surface-3)" }}>
          <label className="block text-[12px] font-medium" style={{ color: "var(--ink-600)" }}>
            Tham số (JSON)
          </label>
          <textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            spellCheck={false}
            rows={3}
            className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-[12px] outline-none"
            style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink-900)" }}
          />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={run} disabled={running} className="ui-btn-primary" style={{ height: 32 }}>
              {running ? "Đang chạy…" : "Chạy"}
            </button>
            {error && (
              <span className="text-[12px]" style={{ color: "var(--danger-ink)" }}>
                {error}
              </span>
            )}
            {result && (
              <span className="text-[12px]" style={{ color: result.ok ? "var(--ink-500)" : "var(--danger-ink)" }}>
                HTTP {result.status || "network"} · {result.ms}ms
              </span>
            )}
          </div>
          {result && (
            <pre
              className="mt-2 max-h-[260px] overflow-auto rounded-lg border p-2.5 text-[11.5px] leading-relaxed"
              style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--ink-800)" }}
            >
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ToolForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("{}");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [inputSchema, setInputSchema] = useState(EXAMPLE_SCHEMA);
  const [secretRef, setSecretRef] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError("");
    let parsedHeaders: Record<string, string> = {};
    let parsedSchema: unknown = undefined;
    try {
      parsedHeaders = headers.trim() ? JSON.parse(headers) : {};
    } catch {
      setSaving(false);
      setError("Headers phải là JSON object");
      return;
    }
    try {
      parsedSchema = inputSchema.trim() ? JSON.parse(inputSchema) : undefined;
    } catch {
      setSaving(false);
      setError("Input schema phải là JSON hợp lệ");
      return;
    }

    const res = await fetch(`/api/biz/${slug}/custom-tools`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        method,
        url,
        headers: parsedHeaders,
        bodyTemplate: bodyTemplate || null,
        inputSchema: parsedSchema,
        secretRef: secretRef || null,
        requiresApproval,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d?.error ?? `lỗi HTTP ${res.status}`);
      return;
    }
    onDone();
  }

  return (
    <div className="mt-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tên tool (snake_case)">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="crm_lookup_order" className={input} />
        </Field>
        <Field label="Phương thức">
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Mô tả (AI dựa vào đây để biết khi nào gọi)">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tra cứu đơn hàng theo mã đơn"
          className={input}
        />
      </Field>

      <Field label="URL (dùng {{tham_so}} nếu cần)">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://api.example.com/orders/{{order_id}}"
          className={input}
        />
      </Field>

      <Field label="Headers (JSON)">
        <textarea
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
          rows={2}
          spellCheck={false}
          className={`${input} font-mono text-[12px]`}
        />
      </Field>

      <Field label="Body template (JSON, chỉ dùng cho POST/PUT/PATCH)">
        <textarea
          value={bodyTemplate}
          onChange={(e) => setBodyTemplate(e.target.value)}
          rows={2}
          spellCheck={false}
          placeholder='{"keyword": "{{keyword}}"}'
          className={`${input} font-mono text-[12px]`}
        />
      </Field>

      <Field label="Input schema (JSON Schema)">
        <textarea
          value={inputSchema}
          onChange={(e) => setInputSchema(e.target.value)}
          rows={6}
          spellCheck={false}
          className={`${input} font-mono text-[12px]`}
        />
      </Field>

      <Field label="Biến môi trường chứa token (tuỳ chọn)">
        <input
          value={secretRef}
          onChange={(e) => setSecretRef(e.target.value)}
          placeholder="ADSYNC_TOOL_SECRET_CRM"
          className={`${input} font-mono text-[12px]`}
        />
        <p className="mt-1 text-[11px]" style={{ color: "var(--ink-400)" }}>
          Chỉ chấp nhận biến bắt đầu bằng <code>ADSYNC_TOOL_SECRET_</code>. Không thể đọc secret hệ thống
          như NEXTAUTH_SECRET hay app secret.
        </p>
      </Field>

      <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ink-700)" }}>
        <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
        Tool có side effect — bắt buộc qua Approval Gate khi gọi từ MCP
      </label>

      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--danger-ink)" }}>
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end gap-2">
        <Dialog.Close className="ui-btn" style={{ height: 36 }}>
          Huỷ
        </Dialog.Close>
        <button type="button" onClick={submit} disabled={saving} className="ui-btn-primary" style={{ height: 36 }}>
          {saving ? "Đang lưu…" : "Lưu tool"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium" style={{ color: "var(--ink-600)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function IconPlus({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconTool({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a4 4 0 0 0 5 5L21 21H10l1.3-9.7a4 4 0 0 1 3.4-5z" />
      <path d="M7 4l1.5 3L12 8.5 8.5 10 7 13l-1.5-3L2 8.5 5.5 7z" />
    </svg>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconExternal, IconLayers, IconPlus } from "../../icons";

type Row = {
  id: string;
  name: string;
  objective: string;
  destination: string;
  dailyBudget: number;
  isDefault: boolean;
  createdAt: string;
};

const OBJECTIVES = [
  ["OUTCOME_SALES", "Doanh số"],
  ["OUTCOME_ENGAGEMENT", "Tương tác"],
  ["OUTCOME_TRAFFIC", "Lưu lượng truy cập"],
  ["OUTCOME_AWARENESS", "Nhận diện"],
  ["OUTCOME_LEADS", "Khách hàng tiềm năng"],
  ["OUTCOME_APP_PROMOTION", "Quảng bá ứng dụng"],
] as const;

const DESTINATIONS = [
  ["OFFSITE_CONVERSIONS", "Chuyển đổi ngoài Facebook"],
  ["MESSAGING_PURCHASE_CONVERSION", "Tin nhắn → mua hàng"],
  ["POST_ENGAGEMENT", "Tương tác bài viết"],
  ["LINK_CLICKS", "Nhấp liên kết"],
  ["LANDING_PAGE_VIEWS", "Lượt xem trang đích"],
  ["ON_POST", "Trên bài viết"],
  ["ON_VIDEO", "Trên video"],
  ["ON_PAGE", "Trên fanpage"],
] as const;

const input = "w-full rounded-xl border px-3 py-2 text-[13.5px] outline-none focus:ring-2";
const labelCls = "mb-1 block text-[12.5px] font-medium";

type Draft = {
  name: string;
  objective: string;
  destination: string;
  dailyBudget: string;
  isDefault: boolean;
};

const EMPTY: Draft = {
  name: "",
  objective: "OUTCOME_SALES",
  destination: "OFFSITE_CONVERSIONS",
  dailyBudget: "300000",
  isDefault: false,
};

export function TemplatesClient({ slug, canManage, rows }: { slug: string; canManage: boolean; rows: Row[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function startCreate() {
    setEditing(null);
    setDraft(EMPTY);
    setCreating(true);
    setMsg("");
  }

  function startEdit(r: Row) {
    setCreating(false);
    setEditing(r.id);
    setDraft({
      name: r.name,
      objective: r.objective,
      destination: r.destination,
      dailyBudget: String(r.dailyBudget),
      isDefault: r.isDefault,
    });
    setMsg("");
  }

  async function submit() {
    setBusy(true);
    setMsg("");
    const payload = {
      name: draft.name.trim(),
      objective: draft.objective,
      destination: draft.destination,
      dailyBudget: Number(draft.dailyBudget),
      isDefault: draft.isDefault,
    };
    const res = await fetch(
      editing
        ? `/api/biz/${slug}/quick-ads/templates/${editing}`
        : `/api/biz/${slug}/quick-ads/templates`,
      {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      const map: Record<string, string> = {
        name_required: "Cần nhập tên mẫu.",
        name_duplicated: "Tên mẫu đã tồn tại.",
        objective_invalid: "Mục tiêu không hợp lệ.",
        destination_required: "Cần chọn vị trí hiển thị.",
        budget_invalid: "Ngân sách tối thiểu 1.000₫.",
        not_found: "Không tìm thấy mẫu.",
      };
      setMsg(map[body.error] ?? body.error ?? "Không lưu được.");
      return;
    }
    setCreating(false);
    setEditing(null);
    router.refresh();
  }

  async function setDefault(id: string) {
    setBusy(true);
    await fetch(`/api/biz/${slug}/quick-ads/templates/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove(r: Row) {
    if (!confirm(`Xoá mẫu “${r.name}”?`)) return;
    setBusy(true);
    await fetch(`/api/biz/${slug}/quick-ads/templates/${r.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  const form = (
    <section className="ui-card ui-card-pad">
      <h2 className="ui-h2 mb-3">{editing ? "Sửa mẫu" : "Thêm mẫu mới"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={labelCls}>Tên mẫu *</span>
          <input
            className={input}
            style={{ borderColor: "var(--line-strong)" }}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="VD: Mẫu sale 11.11"
          />
        </label>
        <label className="block">
          <span className={labelCls}>Mục tiêu</span>
          <select
            className={input}
            style={{ borderColor: "var(--line-strong)" }}
            value={draft.objective}
            onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
          >
            {OBJECTIVES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Vị trí hiển thị</span>
          <select
            className={input}
            style={{ borderColor: "var(--line-strong)" }}
            value={draft.destination}
            onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
          >
            {DESTINATIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Ngân sách/ngày (₫)</span>
          <input
            className={input}
            style={{ borderColor: "var(--line-strong)" }}
            inputMode="numeric"
            value={draft.dailyBudget}
            onChange={(e) => setDraft({ ...draft, dailyBudget: e.target.value.replace(/[^\d]/g, "") })}
          />
        </label>
        <label className="flex items-end gap-2 pb-1 text-[13px]">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
          />
          <span>Đặt làm mẫu mặc định</span>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className="ui-btn-primary disabled:opacity-50">
          {busy ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo mẫu"}
        </button>
        <button
          type="button"
          className="ui-btn"
          onClick={() => {
            setCreating(false);
            setEditing(null);
            setMsg("");
          }}
        >
          Huỷ
        </button>
        {msg && (
          <span className="text-[12.5px]" style={{ color: "var(--danger-ink)" }}>
            {msg}
          </span>
        )}
      </div>
    </section>
  );

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="ui-h1">Mẫu quảng cáo</h1>
          <p className="ui-sub mt-2 max-w-[720px]">Dùng lại các mẫu quảng cáo bạn đã lưu.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && !creating && !editing && (
            <button type="button" onClick={startCreate} className="ui-btn" style={{ height: 38 }}>
              <IconPlus size={14} />
              Thêm mẫu
            </button>
          )}
          <Link href={`/biz/${slug}/dashboard/quick-ads`} className="ui-btn-primary" style={{ height: 38 }}>
            Tạo quảng cáo
          </Link>
        </div>
      </div>

      {canManage && (creating || Boolean(editing)) && <div className="mt-4">{form}</div>}

      <section className="ui-card mt-4 overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl border"
              style={{ borderColor: "var(--line)", background: "var(--surface-3)", color: "var(--brand)" }}
            >
              <IconLayers size={22} />
            </span>
            <p className="mt-3 text-[15px] font-bold" style={{ color: "var(--ink-900)" }}>
              Chưa có mẫu nào
            </p>
            <p className="mt-1 max-w-[460px] text-[13px]" style={{ color: "var(--ink-500)" }}>
              Mẫu được lưu lại ở bước cuối khi bạn tạo một quảng cáo. Tạo quảng cáo từ một bài viết, tinh chỉnh cấu
              hình rồi lưu thành mẫu để dùng lại.
            </p>
            <Link href={`/biz/${slug}/dashboard/quick-ads`} className="ui-btn mt-3">
              <IconExternal size={14} />
              Chọn bài viết để tạo
            </Link>
          </div>
        ) : (
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th>Mẫu</th>
                <th style={{ width: 180 }}>Mục tiêu</th>
                <th style={{ width: 210 }}>Vị trí</th>
                <th style={{ width: 160 }} className="text-right">
                  Ngân sách/ngày
                </th>
                <th style={{ width: 220 }} className="text-right">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold" style={{ color: "var(--ink-900)" }}>
                        {t.name}
                      </span>
                      {t.isDefault && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
                        >
                          Mặc định
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-[13px]" style={{ color: "var(--ink-600)" }}>
                    {labelOf(OBJECTIVES, t.objective)}
                  </td>
                  <td className="text-[13px]" style={{ color: "var(--ink-600)" }}>
                    {labelOf(DESTINATIONS, t.destination)}
                  </td>
                  <td className="text-right text-[13px] font-medium tabular-nums" style={{ color: "var(--ink-800)" }}>
                    {t.dailyBudget.toLocaleString("vi-VN")}₫
                  </td>
                  <td className="text-right">
                    {canManage && (
                      <span className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => startEdit(t)}
                          className="text-[12.5px] font-medium hover:underline"
                          style={{ color: "var(--brand)" }}
                        >
                          Sửa
                        </button>
                        {!t.isDefault && (
                          <button
                            type="button"
                            onClick={() => setDefault(t.id)}
                            disabled={busy}
                            className="text-[12.5px] font-medium hover:underline disabled:opacity-50"
                            style={{ color: "var(--ink-600)" }}
                          >
                            Đặt mặc định
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => remove(t)}
                          disabled={busy}
                          className="text-[12.5px] font-medium hover:underline disabled:opacity-50"
                          style={{ color: "var(--danger-ink)" }}
                        >
                          Xoá
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function labelOf(list: readonly (readonly [string, string])[], key: string) {
  return list.find(([v]) => v === key)?.[1] ?? key;
}

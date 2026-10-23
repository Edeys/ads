"use client";

// Bảng Chỉ số quảng cáo — bám hợp đồng API gốc (catalog / sources / query / views / toggle).
// Nguồn: captures/full-2026-10-20/CONTRACTS-RE.md §1.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AD_CATALOG,
  AD_LEVELS,
  DATE_PRESETS,
  MAX_QUERY_ACCOUNTS,
  MAX_VIEW_COLUMNS,
  catalogFor,
  isPlatform,
  type AdLevel,
  type AdPlatform,
  type MetricDef,
} from "@/lib/ad-catalog";
import { evalFormula, formatValue, type CustomField } from "@/lib/formula";
import {
  IconCalendar,
  IconChevron,
  IconColumns,
  IconExternal,
  IconRefresh,
  IconSearch,
  IconSettings,
} from "../icons";

type SourceAccount = {
  account_key: string;
  credential_id: string;
  account_id: string;
  name: string;
  currency: string;
  timezone: string | null;
  health_status: string;
  is_active: boolean;
  pages: { page_id: string; name: string }[];
  pages_mode: string;
};

type SourcePlatform = {
  platform: AdPlatform;
  label: string;
  credential_type: string;
  accounts: SourceAccount[];
};

type AdView = {
  columns: string[];
  highlights: string[];
  merge_accounts: boolean;
  default_level: AdLevel;
  custom_fields: CustomField[];
};

type AdRow = {
  row_key: string;
  platform: AdPlatform;
  credential_id: string;
  account_id: string;
  account_key: string;
  level: AdLevel;
  id: string;
  name: string;
  status: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  adset_id?: string | null;
  adset_name?: string | null;
  ad_id?: string | null;
  metrics: Record<string, number | null>;
  prev_metrics?: Record<string, number | null> | null;
};

type QueryResult = {
  platform: AdPlatform;
  level: AdLevel;
  accounts: { account_key: string; name: string; currency: string }[];
  rows: AdRow[];
  totals: { by_currency: Record<string, Record<string, number | null>> };
};

const LEVEL_LABEL: Record<AdLevel, string> = {
  campaign: "Chiến dịch",
  adset: "Nhóm quảng cáo",
  ad: "Quảng cáo",
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PAUSED: "bg-amber-50 text-amber-700 border-amber-200",
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Đang chạy",
  PAUSED: "Tạm dừng",
  UNKNOWN: "Không rõ",
};

function formatCell(value: number | null | undefined, def: MetricDef | CustomField | undefined, currency: string) {
  if (value === null || value === undefined) return "—";
  const format = (def as any)?.format ?? "number";
  switch (format) {
    case "currency":
      return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 0 })} ${currency}`;
    case "percent":
      return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
    case "decimal":
      return formatValue(value, "decimal", (def as CustomField)?.decimals ?? 2);
    default:
      return formatValue(value, "number", (def as CustomField)?.decimals ?? 0);
  }
}

function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function resolveRangeClient(
  preset: string,
  from: string,
  to: string,
): { since: string; until: string } {
  const today = vnToday();
  switch (preset) {
    case "today":
      return { since: today, until: today };
    case "yesterday":
      return { since: shiftDay(today, -1), until: shiftDay(today, -1) };
    case "last3":
      return { since: shiftDay(today, -2), until: today };
    case "last7":
      return { since: shiftDay(today, -6), until: today };
    case "this_month":
      return { since: monthStart(today), until: today };
    case "last_month": {
      const start = monthStart(shiftDay(monthStart(today), -1));
      return { since: start, until: shiftDay(monthStart(today), -1) };
    }
    case "this_year":
      return { since: `${today.slice(0, 4)}-01-01`, until: today };
    case "custom": {
      const a = from || today;
      const b = to || today;
      return a <= b ? { since: a, until: b } : { since: b, until: a };
    }
    default:
      return { since: shiftDay(today, -6), until: today };
  }
}

function previousRangeClient(
  preset: string,
  from: string,
  to: string,
): { since: string; until: string } {
  const { since, until } = resolveRangeClient(preset, from, to);
  const len = Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86_400_000) + 1;
  return { since: shiftDay(since, -len), until: shiftDay(until, -len) };
}

function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function defaultViewFor(platform: AdPlatform): AdView {
  const cat = catalogFor(platform);
  return {
    columns: [...cat.default_columns],
    highlights: [],
    merge_accounts: true,
    default_level: cat.levels.includes("campaign") ? "campaign" : cat.levels[0],
    custom_fields: [],
  };
}

export function AdMetricsClient({ slug, canManage }: { slug: string; canManage: boolean }) {
  const [sources, setSources] = useState<SourcePlatform[] | null>(null);
  const [views, setViews] = useState<Record<string, AdView | null> | null>(null);
  const [platform, setPlatform] = useState<AdPlatform>("meta");
  const [level, setLevel] = useState<AdLevel>("campaign");
  const [preset, setPreset] = useState("last7");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "delivering">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<AdView>(defaultViewFor("meta"));
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [density, setDensity] = useState<"compact" | "roomy">("compact");
  const [dateOpen, setDateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [rows, setRows] = useState<AdRow[]>([]);
  const [totals, setTotals] = useState<QueryResult["totals"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visible, setVisible] = useState(25);
  const [campaignId, setCampaignId] = useState("");
  const [adsetId, setAdsetId] = useState("");
  const [filterOptions, setFilterOptions] = useState<{
    campaigns: { id: string; name: string }[];
    adsets: { id: string; name: string; campaignId: string | null }[];
  }>({ campaigns: [], adsets: [] });
  const [compare, setCompare] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [fieldOpen, setFieldOpen] = useState(false);
  const [newField, setNewField] = useState<{ key: string; name: string; formula: string; format: CustomField["format"]; decimals: number }>({
    key: "",
    name: "",
    formula: "",
    format: "decimal",
    decimals: 2,
  });
  const [fieldError, setFieldError] = useState("");
  const requestSeq = useRef(0);

  const platformSource = sources?.find((p) => p.platform === platform) ?? null;
  const accounts = platformSource?.accounts ?? [];
  const catalog = useMemo(() => (isPlatform(platform) ? AD_CATALOG[platform] : AD_CATALOG.meta), [platform]);
  const metricByKey = useMemo(() => new Map(catalog.metrics.map((m) => [m.key, m])), [catalog]);

  // ---------- Load sources / views ----------
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/biz/${slug}/ad-metrics/sources`).then((r) => (r.ok ? r.json() : { platforms: [] })),
      fetch(`/api/biz/${slug}/ad-metrics/views`).then((r) => (r.ok ? r.json() : { views: {} })),
    ])
      .then(([s, v]) => {
        if (!alive) return;
        const list: SourcePlatform[] = s.platforms ?? [];
        setSources(list);
        setViews(v.views ?? {});
        const first = list[0]?.platform ?? "meta";
        setPlatform(first);
        setView(v.views?.[first] ?? defaultViewFor(first));
        setLevel((v.views?.[first] ?? defaultViewFor(first)).default_level);
        setSelected(list.find((p) => p.platform === first)?.accounts.slice(0, 30).map((a) => a.account_key) ?? []);
      })
      .catch(() => {
        if (alive) setError("Không tải được danh sách tài khoản quảng cáo.");
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  // ---------- Đổi nền tảng ----------
  function switchPlatform(next: AdPlatform) {
    if (next === platform) return;
    const v = views?.[next] ?? defaultViewFor(next);
    setPlatform(next);
    setView(v);
    setLevel(v.default_level);
    setSort(null);
    setVisible(25);
    setDirty(false);
    setCampaignId("");
    setAdsetId("");
    const src = sources?.find((p) => p.platform === next);
    setSelected(src?.accounts.slice(0, MAX_QUERY_ACCOUNTS).map((a) => a.account_key) ?? []);
  }

  // ---------- Query ----------
  const queryBody = useMemo(() => {
    if (!selected.length) return null;
    const metrics = new Set<string>(view.columns);
    for (const f of view.custom_fields) {
      for (const m of f.formula.matchAll(/\{([^}]+)\}/g)) if (metricByKey.has(m[1].trim())) metrics.add(m[1].trim());
    }
    const currencyMetric = catalog.metrics.find((m) => m.format === "currency" && m.agg === "sum")?.key;
    if (currencyMetric) metrics.add(currencyMetric);
    return {
      platform,
      level,
      account_keys: [...selected].sort(),
      range: preset === "custom" ? { preset, from: from || null, to: to || null } : { preset },
      metrics: [...metrics].sort(),
      campaign_ids: campaignId ? [campaignId] : [],
      adset_ids: level === "ad" && adsetId ? [adsetId] : [],
      refresh: false,
    };
  }, [platform, level, selected, preset, from, to, view, catalog, metricByKey, campaignId, adsetId]);

  const prevRange = useMemo(
    () => previousRangeClient(preset, from, to),
    [preset, from, to],
  );

  const fetchRows = useCallback(
    async (refresh = false) => {
      if (!queryBody) return;
      const seq = ++requestSeq.current;
      setLoading(true);
      setError("");
      try {
        const post = (body: Record<string, unknown>) =>
          fetch(`/api/biz/${slug}/ad-metrics/query`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
        const prevBody = compare
          ? {
              ...queryBody,
              range: { preset: "custom", from: prevRange.since, to: prevRange.until },
              refresh: false,
            }
          : null;

        const [res, prevRes] = await Promise.all([
          post({ ...queryBody, refresh }),
          prevBody ? post(prevBody) : Promise.resolve(null),
        ]);
        const j = await res.json().catch(() => ({}));
        if (seq !== requestSeq.current) return;
        if (!res.ok) {
          const msg =
            typeof j.detail === "string"
              ? j.detail
              : Array.isArray(j.detail)
                ? j.detail.map((d: any) => String(d.msg ?? "").replace(/^Value error,\s*/, "")).join(" · ")
                : "Không tải được số liệu.";
          setError(msg);
          setRows([]);
          setTotals(null);
          return;
        }

        let prevByKey: Map<string, Record<string, number | null>> | null = null;
        if (prevRes?.ok) {
          const pj = await prevRes.json().catch(() => ({}));
          prevByKey = new Map(
            (pj.rows ?? []).map((r: AdRow) => [r.row_key, r.metrics] as const),
          );
        }

        setRows(
          (j.rows ?? []).map((r: AdRow) => ({
            ...r,
            prev_metrics: prevByKey?.get(r.row_key) ?? null,
          })),
        );
        setTotals(j.totals ?? null);
      } catch {
        if (seq === requestSeq.current) setError("Không kết nối được tới server.");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [queryBody, slug, compare, prevRange.since, prevRange.until],
  );

  useEffect(() => {
    if (selected.length) void fetchRows();
  }, [selected, level, preset, from, to, view.columns.join("|"), compare, fetchRows]);

  // Giữ danh sách lựa chọn cha từ lần tải không lọc, để có thể đổi chiến dịch
  // ngay cả khi bảng đang bị lọc.
  useEffect(() => {
    if (campaignId || adsetId) return;
    const campaigns = new Map<string, string>();
    const adsets = new Map<string, { id: string; name: string; campaignId: string | null }>();
    for (const r of rows) {
      if (r.campaign_id) campaigns.set(r.campaign_id, r.campaign_name ?? r.campaign_id);
      if (r.adset_id) adsets.set(r.adset_id, { id: r.adset_id, name: r.adset_name ?? r.adset_id, campaignId: r.campaign_id ?? null });
    }
    setFilterOptions({
      campaigns: [...campaigns].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "vi")),
      adsets: [...adsets.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")),
    });
  }, [rows, campaignId, adsetId]);

  // ---------- Derived rows ----------
  const currencyOf = useCallback(
    (row: AdRow) => accounts.find((a) => a.account_key === row.account_key)?.currency ?? "VND",
    [accounts],
  );

  const displayed = useMemo(() => {
    let list = rows;
    // Gộp tài khoản: cùng id + level thì cộng metric.
    if (view.merge_accounts && accounts.length > 1) {
      const map = new Map<string, AdRow>();
      for (const r of list) {
        const key = `${r.level}:${r.id}`;
        const cur = map.get(key);
        if (!cur) {
          map.set(key, {
            ...r,
            metrics: { ...r.metrics },
            prev_metrics: r.prev_metrics ? { ...r.prev_metrics } : null,
            account_key: "",
            credential_id: "",
          });
        } else {
          for (const [k, v] of Object.entries(r.metrics)) {
            if (typeof v === "number") cur.metrics[k] = (typeof cur.metrics[k] === "number" ? cur.metrics[k]! : 0) + v;
          }
          if (cur.prev_metrics && r.prev_metrics) {
            for (const [k, v] of Object.entries(r.prev_metrics)) {
              if (typeof v === "number") {
                cur.prev_metrics[k] = (typeof cur.prev_metrics[k] === "number" ? cur.prev_metrics[k]! : 0) + v;
              }
            }
          }
        }
      }
      list = [...map.values()];
    }
    if (status !== "all") {
      list = list.filter((r) => (status === "active" ? r.status === "ACTIVE" : Number(r.metrics.spend ?? 0) > 0));
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.campaign_name ?? "").toLowerCase().includes(needle) ||
          (r.adset_name ?? "").toLowerCase().includes(needle),
      );
    }
    if (sort) {
      const dir = sort.dir === "asc" ? 1 : -1;
      const isStatus = sort.key === "status";
      const isName = sort.key === "name";
      list = [...list].sort((a, b) => {
        if (isName) return a.name.localeCompare(b.name, "vi") * dir;
        if (isStatus) return a.status.localeCompare(b.status) * dir;
        const av = a.metrics[sort.key];
        const bv = b.metrics[sort.key];
        if (typeof av !== "number" && typeof bv !== "number") return 0;
        if (typeof av !== "number") return 1;
        if (typeof bv !== "number") return -1;
        return (av - bv) * dir;
      });
    }
    return list;
  }, [rows, view.merge_accounts, accounts.length, status, q, sort]);

  // ---------- Toggle ----------
  async function toggle(row: AdRow) {
    if (!canManage) {
      setNotice("Bạn không có quyền bật/tắt quảng cáo.");
      return;
    }
    const nextStatus = row.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    setPending((s) => new Set(s).add(row.row_key));
    setRows((list) => list.map((r) => (r.row_key === row.row_key ? { ...r, status: nextStatus } : r)));
    try {
      const res = await fetch(`/api/biz/${slug}/ad-metrics/toggle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: row.platform,
          credential_id: row.credential_id,
          account_id: row.account_id,
          level: row.level,
          entity_id: row.id,
          adset_id: row.adset_id ?? undefined,
          status: nextStatus,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) throw new Error(j.error ?? j.detail ?? "Không đổi được trạng thái.");
      setNotice(nextStatus === "ACTIVE" ? "Đã bật quảng cáo." : "Đã tạm dừng quảng cáo.");
    } catch (e: any) {
      setRows((list) => list.map((r) => (r.row_key === row.row_key ? { ...r, status: row.status } : r)));
      setNotice(e?.message ?? "Không đổi được trạng thái.");
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(row.row_key);
        return next;
      });
    }
  }

  // ---------- View editing ----------
  function updateView(patch: Partial<AdView>) {
    setView((v) => ({ ...v, ...patch }));
    setDirty(true);
  }

  function toggleColumn(key: string) {
    const exists = view.columns.includes(key);
    if (exists && view.columns.length <= 1) return;
    if (!exists && view.columns.length >= MAX_VIEW_COLUMNS) {
      setNotice(`Tối đa ${MAX_VIEW_COLUMNS} cột hiển thị.`);
      return;
    }
    const columns = exists ? view.columns.filter((c) => c !== key) : [...view.columns, key];
    const highlights = view.highlights.filter((h) => columns.includes(h));
    updateView({ columns, highlights });
  }

  function toggleHighlight(key: string) {
    const highlights = view.highlights.includes(key)
      ? view.highlights.filter((h) => h !== key)
      : [...view.highlights, key];
    updateView({ highlights });
  }

  async function saveView() {
    setNotice("");
    const res = await fetch(`/api/biz/${slug}/ad-metrics/views/${platform}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        columns: view.columns,
        highlights: view.highlights,
        merge_accounts: view.merge_accounts,
        default_level: view.default_level,
        custom_fields: view.custom_fields,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = Array.isArray(j.detail) ? j.detail.map((d: any) => d.msg).join(" · ") : j.detail ?? "Không lưu được.";
      setNotice(String(msg));
      return;
    }
    setView(j.view ?? view);
    setViews((v) => ({ ...(v ?? {}), [platform]: j.view ?? view }));
    setDirty(false);
    setNotice("Đã lưu bố cục bảng.");
  }

  async function resetView() {
    const res = await fetch(`/api/biz/${slug}/ad-metrics/views/${platform}`, { method: "DELETE" });
    if (res.ok) {
      const v = defaultViewFor(platform);
      setView(v);
      setViews((s) => ({ ...(s ?? {}), [platform]: null }));
      setDirty(false);
      setNotice("Đã khôi phục bố cục mặc định.");
    }
  }

  function addCustomField() {
    setFieldError("");
    const name = newField.name.trim();
    const formula = newField.formula.trim();
    if (!name || !formula) {
      setFieldError("Nhập tên và công thức.");
      return;
    }
    const key = newField.key || `cf_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}_${view.custom_fields.length + 1}`;
    if (!/^cf_[a-z0-9_]{1,40}$/.test(key)) {
      setFieldError("Mã trường chỉ gồm a-z, 0-9, dấu gạch dưới.");
      return;
    }
    if (view.custom_fields.some((f) => f.key === key)) {
      setFieldError("Mã trường đã tồn tại.");
      return;
    }
    const allowed = catalog.metrics.map((m) => m.key);
    try {
      evalFormula(formula, {});
    } catch {
      /* ignore: validation below */
    }
    const refs = [...formula.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].trim());
    const unknown = refs.find((r) => !allowed.includes(r));
    if (unknown) {
      setFieldError(`Chỉ số "${unknown}" không có trên nền tảng này.`);
      return;
    }
    if (!refs.length) {
      setFieldError("Công thức cần tham chiếu ít nhất một chỉ số trong ngoặc nhọn.");
      return;
    }
    const field: CustomField = {
      key,
      name,
      formula,
      format: newField.format,
      decimals: newField.format === "percent" || newField.format === "decimal" ? newField.decimals : 0,
    };
    updateView({ custom_fields: [...view.custom_fields, field], columns: [...view.columns, key] });
    setFieldOpen(false);
    setNewField({ key: "", name: "", formula: "", format: "decimal", decimals: 2 });
  }

  // ---------- Render helpers ----------
  const valueFrom = (metrics: Record<string, number | null> | null | undefined, key: string): number | null => {
    if (!metrics) return null;
    const custom = view.custom_fields.find((f) => f.key === key);
    if (custom) {
      const values: Record<string, number> = {};
      for (const m of custom.formula.matchAll(/\{([^}]+)\}/g)) {
        const v = metrics[m[1].trim()];
        values[m[1].trim()] = typeof v === "number" ? v : 0;
      }
      return evalFormula(custom.formula, values);
    }
    const v = metrics[key];
    return typeof v === "number" ? v : null;
  };

  const cellValue = (row: AdRow, key: string): number | null => valueFrom(row.metrics, key);

  const totalCurrencies = totals ? Object.keys(totals.by_currency) : [];
  const currencyLabel = totalCurrencies.length === 1 ? totalCurrencies[0] : "VND";
  const totalRow = totals?.by_currency[currencyLabel] ?? null;

  return (
    <main className="px-[18px] pb-10 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="ui-h1">Hiển thị kết quả</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canManage && (
            <Link href={`/biz/${slug}/dashboard/ad-metrics/settings`} className="ui-btn" style={{ height: 38 }}>
              <IconSettings size={15} />
              Cấu hình
            </Link>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setDateOpen((v) => !v)}
              className="ui-btn"
              style={{ height: 38, minWidth: 132 }}
            >
              <IconCalendar size={15} />
              <span>{DATE_PRESETS.find((p) => p.value === preset)?.label ?? "Tuỳ chỉnh"}</span>
              <span style={{ color: "var(--ink-400)" }}>
                {new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
              </span>
              <IconChevron size={13} style={{ color: "var(--ink-400)" }} />
            </button>
            {dateOpen && (
              <>
                <span className="fixed inset-0 z-20" onClick={() => setDateOpen(false)} />
                <div
                  className="absolute right-0 top-11 z-30 w-[240px] rounded-xl border bg-[var(--card)] p-1.5"
                  style={{ borderColor: "var(--line)", boxShadow: "var(--shadow-pop)" }}
                >
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        setPreset(p.value);
                        setVisible(25);
                        if (p.value !== "custom") setDateOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--surface-3)]"
                      style={
                        preset === p.value
                          ? { background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 600 }
                          : { color: "var(--ink-700)" }
                      }
                    >
                      {p.label}
                    </button>
                  ))}
                  {preset === "custom" && (
                    <div className="mt-1 flex items-center gap-1.5 border-t px-1.5 pt-2" style={{ borderColor: "var(--line)" }}>
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="w-full rounded-lg border px-1.5 py-1 text-[12px]"
                        style={{ borderColor: "var(--line-strong)" }}
                      />
                      <span style={{ color: "var(--ink-400)" }}>→</span>
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="w-full rounded-lg border px-1.5 py-1 text-[12px]"
                        style={{ borderColor: "var(--line-strong)" }}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button type="button" onClick={() => void fetchRows(true)} className="ui-btn" style={{ height: 38 }}>
            <IconRefresh size={15} />
            Làm mới
          </button>

          <Link
            href={`/biz/${slug}/dashboard/ad-metrics/settings`}
            className="ui-btn"
            style={{ height: 38, width: 38, padding: 0 }}
            title="Mở cấu hình bảng"
          >
            <IconExternal size={16} />
          </Link>
        </div>
      </div>

      <p className="ui-sub mt-1.5 max-w-[720px]">
        Chỉ số chiến dịch, nhóm quảng cáo và quảng cáo từ các kết nối quảng cáo, theo cột bạn đã cấu hình. Bật/tắt
        ngay trên bảng.
      </p>

      {/* Nền tảng */}
      <div className="ui-scroll-x mt-4 flex flex-nowrap items-center gap-1.5 overflow-x-auto">
        {(sources ?? []).map((p) => {
          const on = platform === p.platform;
          return (
            <button
              key={p.platform}
              type="button"
              onClick={() => switchPlatform(p.platform)}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold transition-colors"
              style={
                on
                  ? { background: "var(--brand-soft)", color: "var(--brand)" }
                  : { color: "var(--ink-600)" }
              }
            >
              {p.label}
              <span
                className="rounded-full px-1.5 text-[11px] font-bold"
                style={on ? { background: "var(--card)", color: "var(--brand)" } : { background: "var(--surface-3)", color: "var(--ink-500)" }}
              >
                {p.accounts.length}
              </span>
            </button>
          );
        })}
        {sources && sources.length === 0 && (
          <span className="text-[13px]" style={{ color: "var(--ink-500)" }}>
            Chưa có kết nối quảng cáo nào.{" "}
            <Link href={`/biz/${slug}/dashboard/connections`} style={{ color: "var(--brand)" }}>
              Thêm kết nối
            </Link>
          </span>
        )}
      </div>

      <section className="ui-card mt-3 overflow-hidden p-0">
        {/* Hàng bộ lọc: cuộn ngang 1 hàng, không xuống dòng */}
        <div className="ui-scroll-x flex flex-nowrap items-center gap-2 overflow-x-auto px-3 py-3">
          {/* Cấp dữ liệu */}
          <div className="flex shrink-0 items-center gap-1 rounded-[10px] p-1" style={{ background: "var(--surface-3)" }}>
            {AD_LEVELS.filter((l) => catalog.levels.includes(l)).map((l) => {
              const on = level === l;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    setLevel(l);
                    setCampaignId("");
                    setAdsetId("");
                  }}
                  className="inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors"
                  style={
                    on
                      ? { background: "var(--card)", color: "var(--ink-900)", boxShadow: "0 1px 2px rgba(13,27,42,.08)", fontWeight: 600 }
                      : { color: "var(--ink-500)" }
                  }
                >
                  {LEVEL_LABEL[l]}
                </button>
              );
            })}
          </div>

          {level !== "campaign" && filterOptions.campaigns.length > 0 && (
            <select
              aria-label="Lọc theo chiến dịch"
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setAdsetId("");
              }}
              className="h-9 max-w-[190px] shrink-0 rounded-[10px] border bg-[var(--card)] px-2 text-[12.5px] font-medium outline-none"
              style={{ borderColor: "var(--line)", color: "var(--ink-700)" }}
            >
              <option value="">Mọi chiến dịch</option>
              {filterOptions.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {level === "ad" && filterOptions.adsets.length > 0 && (
            <select
              aria-label="Lọc theo nhóm quảng cáo"
              value={adsetId}
              onChange={(e) => setAdsetId(e.target.value)}
              className="h-9 max-w-[190px] shrink-0 rounded-[10px] border bg-[var(--card)] px-2 text-[12.5px] font-medium outline-none"
              style={{ borderColor: "var(--line)", color: "var(--ink-700)" }}
            >
              <option value="">Mọi nhóm quảng cáo</option>
              {filterOptions.adsets
                .filter((a) => !campaignId || a.campaignId === campaignId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          )}

          {(campaignId || adsetId) && (
            <button
              type="button"
              onClick={() => {
                setCampaignId("");
                setAdsetId("");
              }}
              className="h-9 shrink-0 rounded-[10px] px-2 text-[12px] font-medium"
              style={{ color: "var(--danger-ink)" }}
            >
              Xoá lọc
            </button>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCompare((v) => !v)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[12.5px] font-medium"
              style={
                compare
                  ? { borderColor: "var(--brand)", background: "var(--brand-soft)", color: "var(--brand)" }
                  : { borderColor: "var(--line)", color: "var(--ink-600)" }
              }
              title={`So sánh với ${prevRange.since} → ${prevRange.until}`}
            >
              So sánh kỳ trước
            </button>

            {/* Trạng thái */}
            <div className="flex items-center gap-1 rounded-[10px] p-1" style={{ background: "var(--surface-3)" }}>
              {(
                [
                  ["all", "Tất cả"],
                  ["active", "Đang bật"],
                  ["delivering", "Có chi tiêu"],
                ] as const
              ).map(([k, label]) => {
                const on = status === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStatus(k)}
                    className="inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors"
                    style={
                      on
                        ? { background: "var(--card)", color: "var(--ink-900)", boxShadow: "0 1px 2px rgba(13,27,42,.08)" }
                        : { color: "var(--ink-500)" }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <label className="relative block w-[200px] shrink-0">
              <IconSearch
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: "var(--ink-400)" }}
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên hoặc ID"
                className="h-9 w-full rounded-[10px] border bg-[var(--card)] pl-9 pr-3 text-[13px] outline-none focus:ring-2"
                style={{ borderColor: "var(--line)" }}
              />
            </label>

            {/* Chọn tài khoản */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border bg-[var(--card)] px-3 text-[13px] font-medium"
                style={{ borderColor: "var(--line)", color: "var(--ink-700)" }}
              >
                {selected.length === accounts.length
                  ? "Tất cả tài khoản"
                  : `${selected.length}/${accounts.length} tài khoản`}
                <IconChevron size={13} style={{ color: "var(--ink-400)" }} />
              </button>
              {accountOpen && (
                <>
                  <span className="fixed inset-0 z-20" onClick={() => setAccountOpen(false)} />
                  <div
                    className="absolute right-0 top-11 z-30 max-h-72 w-80 overflow-auto rounded-xl border bg-[var(--card)] p-2"
                    style={{ borderColor: "var(--line)", boxShadow: "var(--shadow-pop)" }}
                  >
                    <div className="mb-1 flex items-center justify-between px-1 text-[11.5px]" style={{ color: "var(--ink-400)" }}>
                      <span>Tối đa {MAX_QUERY_ACCOUNTS} tài khoản</span>
                      <button
                        type="button"
                        style={{ color: "var(--brand)" }}
                        onClick={() => setSelected(accounts.slice(0, MAX_QUERY_ACCOUNTS).map((a) => a.account_key))}
                      >
                        Chọn hết
                      </button>
                    </div>
                    {accounts.map((a) => {
                      const on = selected.includes(a.account_key);
                      return (
                        <label
                          key={a.account_key}
                          className="flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-[13px] hover:bg-[var(--surface-3)]"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              setSelected((list) => {
                                if (on) return list.filter((k) => k !== a.account_key);
                                if (list.length >= MAX_QUERY_ACCOUNTS) {
                                  setNotice(`Tối đa ${MAX_QUERY_ACCOUNTS} tài khoản mỗi lần xem.`);
                                  return list;
                                }
                                return [...list, a.account_key];
                              });
                              setVisible(25);
                            }}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block truncate" style={{ color: "var(--ink-800)" }}>
                              {a.name}
                            </span>
                            <span className="block text-[11px]" style={{ color: "var(--ink-400)" }}>
                              {a.account_id} · {a.currency}
                              {a.health_status !== "ok" ? ` · ${a.health_status}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {accounts.length === 0 && (
                      <p className="p-2 text-[12.5px]" style={{ color: "var(--ink-500)" }}>
                        Nền tảng này chưa có tài khoản.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Mật độ bảng */}
            <div className="flex shrink-0 items-center gap-1 rounded-[10px] p-1" style={{ background: "var(--surface-3)" }}>
              {(
                [
                  ["compact", "Gọn"],
                  ["roomy", "Thoáng"],
                ] as const
              ).map(([k, label]) => {
                const on = density === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDensity(k)}
                    className="inline-flex h-7 items-center rounded-[8px] px-2.5 text-[12.5px] font-medium transition-colors"
                    style={
                      on
                        ? { background: "var(--card)", color: "var(--ink-900)", boxShadow: "0 1px 2px rgba(13,27,42,.08)" }
                        : { color: "var(--ink-500)" }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Cột & tuỳ chọn bảng */}
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label="Cột và tuỳ chọn bảng"
                onClick={() => setPickerOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border bg-[var(--card)]"
                style={{ borderColor: "var(--line)", color: "var(--ink-600)" }}
              >
                <IconColumns size={16} />
              </button>
              {pickerOpen && (
                <>
                  <span className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
                  <div
                    className="absolute right-0 top-11 z-30 max-h-[480px] w-[320px] overflow-auto rounded-xl border bg-[var(--card)] p-2"
                    style={{ borderColor: "var(--line)", boxShadow: "var(--shadow-pop)" }}
                  >
                    <label className="mb-2 flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px]" style={{ color: "var(--ink-700)" }}>
                      <input
                        type="checkbox"
                        checked={view.merge_accounts}
                        onChange={(e) => updateView({ merge_accounts: e.target.checked })}
                      />
                      Gộp tài khoản
                    </label>
                    <div className="my-1 h-px" style={{ background: "var(--line)" }} />
                    {[...new Set(catalog.metrics.map((m) => m.group))].map((group) => (
                      <div key={group} className="mb-2">
                        <div className="px-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ink-400)" }}>
                          {group}
                        </div>
                        {catalog.metrics
                          .filter((m) => m.group === group)
                          .map((m) => {
                            const on = view.columns.includes(m.key);
                            return (
                              <label
                                key={m.key}
                                className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-[13px] hover:bg-[var(--surface-3)]"
                              >
                                <input type="checkbox" checked={on} onChange={() => toggleColumn(m.key)} />
                                <span className="flex-1 truncate">{m.label}</span>
                                {on && (
                                  <button
                                    type="button"
                                    title="Đánh dấu cột chính"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      toggleHighlight(m.key);
                                    }}
                                    className={view.highlights.includes(m.key) ? "text-amber-500" : "text-zinc-300"}
                                  >
                                    ★
                                  </button>
                                )}
                              </label>
                            );
                          })}
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--line)" }}>
                      <button
                        type="button"
                        onClick={() => setFieldOpen((v) => !v)}
                        className="text-[12.5px] font-medium"
                        style={{ color: "var(--brand)" }}
                      >
                        + Trường công thức
                      </button>
                      <div className="flex gap-1.5">
                        {dirty && (
                          <button type="button" onClick={() => void saveView()} className="ui-btn-primary" style={{ padding: "4px 8px", fontSize: 12 }}>
                            Lưu bố cục
                          </button>
                        )}
                        <button type="button" onClick={() => void resetView()} className="ui-btn" style={{ padding: "4px 8px", fontSize: 12 }}>
                          Mặc định
                        </button>
                      </div>
                    </div>
                    {fieldOpen && (
                      <div className="mt-2 space-y-1.5 rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
                        <input
                          value={newField.name}
                          onChange={(e) => setNewField((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Tên trường (VD: ROI)"
                          className="w-full rounded-lg border px-2 py-1 text-[12.5px]"
                          style={{ borderColor: "var(--line-strong)" }}
                        />
                        <input
                          value={newField.formula}
                          onChange={(e) => setNewField((f) => ({ ...f, formula: e.target.value }))}
                          placeholder="Công thức: {action_values_purchase}/{spend}"
                          className="w-full rounded-lg border px-2 py-1 font-mono text-[11.5px]"
                          style={{ borderColor: "var(--line-strong)" }}
                        />
                        <div className="flex items-center gap-2 text-[11.5px]">
                          <select
                            value={newField.format}
                            onChange={(e) => setNewField((f) => ({ ...f, format: e.target.value as CustomField["format"] }))}
                            className="rounded-lg border px-1 py-1"
                            style={{ borderColor: "var(--line-strong)" }}
                          >
                            <option value="decimal">Số thập phân</option>
                            <option value="number">Số</option>
                            <option value="currency">Tiền tệ</option>
                            <option value="percent">Phần trăm</option>
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={4}
                            value={newField.decimals}
                            onChange={(e) => setNewField((f) => ({ ...f, decimals: Number(e.target.value) }))}
                            className="w-14 rounded-lg border px-1 py-1"
                            style={{ borderColor: "var(--line-strong)" }}
                          />
                          <button type="button" onClick={addCustomField} className="ui-btn-primary ml-auto" style={{ padding: "3px 8px", fontSize: 12 }}>
                            Thêm
                          </button>
                        </div>
                        {fieldError && <p className="text-[11px]" style={{ color: "var(--danger-ink)" }}>{fieldError}</p>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="h-3" />
      </section>

      {(notice || error || dirty) && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
          {error && <span className="text-red-600">{error}</span>}
          {notice && <span className="text-zinc-600">{notice}</span>}
          {dirty && !notice && <span className="text-amber-600">Bố cục chưa lưu.</span>}
          {(notice || error) && (
            <button type="button" onClick={() => { setNotice(""); setError(""); }} className="text-zinc-400 hover:text-zinc-600">
              ×
            </button>
          )}
        </div>
      )}

      {/* Bảng */}
      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table
            className={`w-full text-[13.5px] ${density === "compact" ? "[&_td]:py-2 [&_th]:py-2" : "[&_td]:py-3.5 [&_th]:py-3"}`}
          >
            <thead className="text-[12.5px]">
              <tr>
                <th className="sticky left-0 z-10 min-w-[240px] border-b bg-[var(--card)] px-4 py-2.5 text-left font-semibold" style={{ borderColor: "var(--line)", color: "var(--ink-500)" }}>
                  <button
                    type="button"
                    onClick={() => setSort({ key: "name", dir: sort?.key === "name" && sort.dir === "asc" ? "desc" : "asc" })}
                    className="hover:text-zinc-900"
                  >
                    Tên {sort?.key === "name" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th className="px-2 py-2 text-left font-medium">
                  <button
                    type="button"
                    onClick={() => setSort({ key: "status", dir: sort?.key === "status" && sort.dir === "asc" ? "desc" : "asc" })}
                    className="hover:text-zinc-900"
                  >
                    Trạng thái {sort?.key === "status" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                {view.columns.map((key) => {
                  const def = metricByKey.get(key) ?? view.custom_fields.find((f) => f.key === key);
                  const isCustom = view.custom_fields.some((f) => f.key === key);
                  return (
                    <th key={key} className="whitespace-nowrap px-2 py-2 text-right font-medium">
                      <button
                        type="button"
                        onClick={() => setSort({ key, dir: sort?.key === key && sort.dir === "desc" ? "asc" : "desc" })}
                        className={`hover:text-zinc-900 ${view.highlights.includes(key) ? "font-semibold text-zinc-900" : ""}`}
                        title={(def as MetricDef)?.description ?? undefined}
                      >
                        {(def as any)?.label ?? (def as any)?.name ?? key}
                        {isCustom ? " ƒ" : ""}
                        {sort?.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  );
                })}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={view.columns.length + 3} className="px-3 py-10 text-center text-zinc-400">
                    Đang tải số liệu…
                  </td>
                </tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr>
                  <td colSpan={view.columns.length + 3} className="px-3 py-10 text-center text-zinc-400">
                    {selected.length ? "Không có dữ liệu trong kỳ này." : "Chọn ít nhất một tài khoản để xem số liệu."}
                  </td>
                </tr>
              )}
              {displayed.slice(0, visible).map((row) => {
                const currency = currencyOf(row);
                const busy = pending.has(row.row_key);
                return (
                  <tr key={row.row_key} className="border-t hover:bg-zinc-50/60">
                    <td className="sticky left-0 z-10 max-w-[420px] bg-[var(--card)] px-3 py-2">
                      <div className="truncate font-medium" title={row.name}>
                        {row.name}
                      </div>
                      <div className="truncate text-[11px] text-zinc-400">
                        {[row.campaign_name, row.adset_name].filter(Boolean).join(" › ") || row.id}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${
                          STATUS_TONE[row.status] ?? "border-zinc-200 bg-zinc-50 text-zinc-600"
                        }`}
                      >
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>
                    {view.columns.map((key) => {
                      const def = metricByKey.get(key) ?? view.custom_fields.find((f) => f.key === key);
                      const highlight = view.highlights.includes(key);
                      const cur = cellValue(row, key);
                      const prev = compare ? valueFrom(row.prev_metrics, key) : null;
                      const delta = compare ? deltaPct(cur, prev) : null;
                      return (
                        <td
                          key={key}
                          className={`whitespace-nowrap px-2 py-2 text-right tabular-nums ${
                            highlight ? "font-semibold text-zinc-900" : "text-zinc-700"
                          }`}
                          title={
                            compare && prev !== null
                              ? `Kỳ trước: ${formatCell(prev, def as any, currency)}${
                                  delta === null ? "" : ` · ${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`
                                }`
                              : undefined
                          }
                        >
                          <div>{formatCell(cur, def as any, currency)}</div>
                          {compare && delta !== null && (
                            <div className="text-[10px] font-medium leading-tight" style={{ color: "var(--ink-400)" }}>
                              {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"}{" "}
                              {Math.abs(delta).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy || !canManage}
                        onClick={() => void toggle(row)}
                        className="rounded border px-2 py-1 text-[11px] hover:bg-zinc-50 disabled:opacity-40"
                        title={canManage ? "Bật/tắt trên nền tảng" : "Bạn không có quyền thao tác"}
                      >
                        {busy ? "…" : row.status === "ACTIVE" ? "Tắt" : "Bật"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totalRow && displayed.length > 0 && (
              <tfoot className="bg-zinc-50 text-xs font-medium">
                <tr>
                  <td className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-left">Tổng ({displayed.length} dòng)</td>
                  <td className="px-2 py-2" />
                  {view.columns.map((key) => {
                    const def = metricByKey.get(key) ?? view.custom_fields.find((f) => f.key === key);
                    const isCustom = view.custom_fields.some((f) => f.key === key);
                    const value = isCustom ? null : totalRow[key];
                    return (
                      <td key={key} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                        {value === null || value === undefined ? "—" : formatCell(value, def as any, currencyLabel)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {visible < displayed.length && (
          <div className="border-t p-2">
            <button
              type="button"
              onClick={() => setVisible((v) => v + 25)}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Hiện thêm ({displayed.length - visible} dòng nữa)
            </button>
          </div>
        )}
      </div>

      {compare && (
        <p className="mt-2 text-[11px]" style={{ color: "var(--ink-500)" }}>
          Đang so sánh với kỳ trước: {prevRange.since} → {prevRange.until}. Đưa chuột lên ô số liệu để xem giá trị kỳ trước.
        </p>
      )}

      {totalCurrencies.length > 1 && (
        <p className="mt-2 text-[11px] text-zinc-500">
          Tổng đang hiển thị theo {currencyLabel}. Các loại tiền khác:{" "}
          {totalCurrencies
            .filter((c) => c !== currencyLabel)
            .map((c) => {
              const t = totals?.by_currency[c];
              return `${c} ${Number(t?.spend ?? 0).toLocaleString("vi-VN")}`;
            })
            .join(" · ")}
        </p>
      )}
    </main>
  );
}

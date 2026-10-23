// Chi tiết 1 cấu hình + lịch sử chạy (Done.vn: /dashboard/configs/[id])
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { getMembership } from "@/lib/guard";
import { RunConfigButton } from "./run-button";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  metrics_pull: "Kéo chỉ số",
  auto_pause: "Ads Autopilot (ngưỡng CPA)",
  budget_schedule: "Tăng giảm ngân sách",
  post_trigger: "Tự động chạy ads",
};

const STATUS_LABEL: Record<string, string> = { on: "Đang bật", off: "Đang tắt", error: "Lỗi" };
const RUN_TONE: Record<string, string> = {
  ok: "var(--ok-ink)",
  error: "var(--danger-ink)",
  skipped: "var(--warn-ink)",
};

function fmt(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleString("vi-VN", { hour12: false });
}

export default async function ConfigDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const m = await getMembership(slug);
  if (!m) redirect("/login");

  const [config] = await db
    .select()
    .from(schema.configs)
    .where(and(eq(schema.configs.bizId, m.biz.id), eq(schema.configs.id, id)))
    .limit(1);
  if (!config) notFound();

  const runs = await db
    .select()
    .from(schema.configRuns)
    .where(eq(schema.configRuns.configId, id))
    .orderBy(desc(schema.configRuns.startedAt))
    .limit(20);

  const conn = config.credentialId
    ? (
        await db
          .select({ name: schema.connections.name, provider: schema.connections.provider })
          .from(schema.connections)
          .where(eq(schema.connections.id, config.credentialId))
          .limit(1)
      )[0]
    : null;

  return (
    <main className="px-[18px] pb-10 pt-6">
      <Link href={`/biz/${slug}/dashboard/configs`} className="text-[13px] font-medium" style={{ color: "var(--brand)" }}>
        ← Tất cả cấu hình
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-h1">{config.name}</h1>
          <p className="ui-sub mt-1.5">
            {TYPE_LABEL[config.type] ?? config.type} · chu kỳ {config.intervalMinutes} phút · nền tảng{" "}
            {config.provider}
          </p>
        </div>
        <RunConfigButton slug={slug} id={id} disabled={config.status === "off"} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="ui-card ui-card-pad lg:col-span-2">
          <h2 className="ui-h2 mb-3">Thông số</h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {[
              ["Trạng thái", STATUS_LABEL[config.status] ?? config.status],
              ["Kết nối", conn ? `${conn.name} (${conn.provider})` : "—"],
              ["Lần chạy gần nhất", fmt(config.lastRunAt)],
              [
                "Lần chạy kế tiếp",
                config.status === "on"
                  ? fmt(new Date((config.lastRunAt ?? config.createdAt).getTime() + config.intervalMinutes * 60_000))
                  : "—",
              ],
              ["Kết quả lần gần nhất", config.lastRunStatus ?? "—"],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="ui-label">{k}</dt>
                <dd className="mt-0.5 text-[14px] font-medium" style={{ color: "var(--ink-800)" }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>

          {config.lastError && (
            <p className="mt-4 rounded-xl px-3 py-2 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger-ink)" }}>
              {config.lastError}
            </p>
          )}

          <h2 className="ui-h2 mb-2 mt-6">Cấu hình chi tiết</h2>
          <pre
            className="ui-scroll max-h-72 overflow-auto rounded-xl border p-3 text-[12.5px] leading-relaxed"
            style={{ borderColor: "var(--line)", background: "var(--row-hover)", color: "var(--ink-700)" }}
          >
            {JSON.stringify(config.params ?? {}, null, 2)}
          </pre>
        </section>

        <section className="ui-card ui-card-pad">
          <h2 className="ui-h2 mb-3">Lịch sử chạy</h2>
          {runs.length === 0 ? (
            <p className="ui-sub">Chưa chạy lần nào.</p>
          ) : (
            <ol className="space-y-3">
              {runs.map((r) => (
                <li key={r.id} className="border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold" style={{ color: RUN_TONE[r.status] ?? "var(--ink-700)" }}>
                      {r.status}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--ink-400)" }}>
                      {fmt(r.startedAt)}
                    </span>
                  </div>
                  {r.error && (
                    <p className="mt-1 text-[12px]" style={{ color: "var(--danger-ink)" }}>
                      {r.error}
                    </p>
                  )}
                  {Object.keys(r.detail ?? {}).length > 0 && (
                    <p className="mt-1 break-words text-[12px]" style={{ color: "var(--ink-500)" }}>
                      {JSON.stringify(r.detail)}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}

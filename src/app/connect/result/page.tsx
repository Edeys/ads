// Trang công khai kết thúc OAuth trong trình duyệt hệ thống.
// Không yêu cầu đăng nhập vì trình duyệt ngoài không có phiên của WebView.
import Link from "next/link";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  tiktok: "TikTok Ads",
};

export default async function ConnectResultPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; status?: string; slug?: string; message?: string; code?: string }>;
}) {
  const sp = await searchParams;
  const provider = sp.provider ?? "meta";
  const label = LABEL[provider] ?? provider;
  const ok = sp.status !== "error";
  const detail =
    sp.message ||
    (ok
      ? `Đã kết nối ${label}. Tài khoản quảng cáo và quyền đã được lưu vào AdsSync.`
      : `Không kết nối được ${label}${sp.code ? ` (${sp.code})` : ""}.`);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-[520px]">
        <div className="ui-card p-6 text-center">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-[22px] font-bold"
            style={
              ok
                ? { background: "var(--ok-bg)", color: "var(--ok-ink)" }
                : { background: "var(--danger-bg)", color: "var(--danger-ink)" }
            }
          >
            {ok ? "✓" : "!"}
          </div>
          <h1 className="ui-h1 mt-3">{ok ? "Kết nối thành công" : "Kết nối thất bại"}</h1>
          <p className="ui-sub mt-2">{detail}</p>

          <div
            className="mt-4 rounded-xl px-3 py-2.5 text-left text-[12.5px]"
            style={{ background: "var(--surface-3)", color: "var(--ink-600)" }}
          >
            {ok ? (
              <>
                <p className="font-semibold" style={{ color: "var(--ink-800)" }}>
                  Bước tiếp theo
                </p>
                <p className="mt-1">
                  Đóng tab trình duyệt này, quay lại cửa sổ <strong>AdsSync</strong> và bấm{" "}
                  <strong>Làm mới</strong> ở màn <strong>Kết nối</strong>. Kết nối đã được lưu ngay cả khi
                  tab này không đăng nhập.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold" style={{ color: "var(--ink-800)" }}>
                  Cách xử lý
                </p>
                <p className="mt-1">
                  Quay lại AdsSync → <strong>Kết nối</strong> → mở <strong>Chẩn đoán</strong> /{" "}
                  <strong>Cài đặt → Ứng dụng OAuth</strong> để xem mục nào còn thiếu, rồi thử lại.
                </p>
              </>
            )}
          </div>

          <div className="mt-4 flex justify-center gap-2">
            <Link href="/biz" className="ui-btn">
              Mở AdsSync
            </Link>
            {sp.slug && (
              <Link href={`/biz/${sp.slug}/dashboard/connections`} className="ui-btn-primary">
                Về màn Kết nối
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

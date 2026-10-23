import Link from "next/link";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border bg-[var(--card)] p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Trung tâm Hỗ trợ Kỹ thuật</h1>
            <p className="mt-1 text-sm text-zinc-500">Giải đáp thắc mắc và xử lý sự cố trong quá trình vận hành AdsSync</p>
          </div>
          <Link
            href="/biz"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Về Dashboard →
          </Link>
        </div>

        <div className="space-y-6 text-sm text-zinc-700">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <h2 className="font-semibold text-blue-900 mb-1">Cộng đồng & Trợ giúp trực tiếp</h2>
            <p className="text-xs text-blue-700">
              Đối với bản Self-Hosted nội bộ, toàn bộ dữ liệu của bạn được lưu an toàn trên máy chủ của bạn (PGlite tại <code>./.pgdata</code>). Nếu gặp bất kỳ thắc mắc hoặc cần tài liệu tuỳ biến, vui lòng liên hệ:
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-blue-800">
              <div>📧 Email: support@adssync.local</div>
              <div>💬 Telegram: @AdsSyncSupportBot</div>
            </div>
          </div>

          <div>
            <h2 className="text-base font-bold text-zinc-900 mb-3">Các câu hỏi thường gặp (FAQ)</h2>
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="font-semibold text-zinc-900">1. Tại sao kết nối Meta Ads của tôi báo trạng thái "dead"?</h3>
                <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                  Nguyên nhân phổ biến nhất là System User Access Token đã hết hạn hoặc tài khoản quảng cáo chưa được gán quyền cho System User đó trong Meta Business Manager. Hãy bấm nút <em>"Check lại"</em> hoặc cập nhật token mới.
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="font-semibold text-zinc-900">2. Google Sheets báo lỗi không thể ghi dòng?</h3>
                <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                  Hãy đảm bảo bạn đã mở Google Spreadsheet và bấm <strong>Chia sẻ (Share)</strong> cho địa chỉ email của Service Account (tìm thấy trong file JSON: <code>client_email</code>) với quyền là <strong>Người chỉnh sửa (Editor)</strong>.
                </p>
              </div>

              <div className="rounded-lg border p-4">
                <h3 className="font-semibold text-zinc-900">3. Làm sao để chạy worker định kỳ trong môi trường local?</h3>
                <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                  Trong chế độ PGlite embedded, bạn có thể gọi endpoint nội bộ <code>POST /api/dev/tick</code> để kích hoạt worker ngay lập tức, hoặc chạy tiến trình <code>npx tsx src/worker/index.ts</code> khi chuyển sang cơ sở dữ liệu PostgreSQL độc lập (cấu hình qua biến <code>DATABASE_URL</code>).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

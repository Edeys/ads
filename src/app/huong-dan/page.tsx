import Link from "next/link";

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-2xl border bg-[var(--card)] p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Hướng dẫn sử dụng AdsSync</h1>
            <p className="mt-1 text-sm text-zinc-500">Tài liệu chi tiết từ thiết lập ban đầu đến tự động hoá chuyên sâu</p>
          </div>
          <Link
            href="/biz"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Về Dashboard →
          </Link>
        </div>

        <div className="space-y-8 text-sm text-zinc-700 leading-relaxed">
          {/* Section 1 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">1. Kết nối Tài khoản Quảng cáo (Meta Ads)</h2>
            <p className="mb-2">
              Để hệ thống kéo số liệu và thực hiện các thao tác Autopilot (tắt camp, đổi budget), bạn cần cấp quyền cho AdsSync:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Cách 1 (Nhập Access Token):</strong> Vào mục <em>Kết nối</em> → Chọn <em>Meta Ads</em> → Nhập System User Access Token từ Meta Business Manager. Token cần các quyền: <code>ads_read</code>, <code>ads_management</code>, <code>pages_read_engagement</code>.
              </li>
              <li>
                <strong>Cách 2 (OAuth tự động):</strong> Thiết lập <code>META_APP_ID</code> và <code>META_APP_SECRET</code> trong file <code>.env</code>. Sau đó bấm nút <em>"Kết nối qua Facebook"</em> để uỷ quyền trực tiếp.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">2. Kết nối Google Sheets (Đồng bộ số liệu)</h2>
            <p className="mb-2">AdsSync sử dụng Google Service Account với chứng thực JWT RS256 để ghi số liệu an toàn:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Truy cập Google Cloud Console → Tạo Service Account mới.</li>
              <li>Tạo Key dạng JSON và tải về máy tính.</li>
              <li>Vào mục <em>Kết nối</em> → Chọn <em>Google Sheets</em> → Dán toàn bộ nội dung file JSON vào ô cấu hình.</li>
              <li>Mở file Google Spreadsheet của bạn và chia sẻ (Share) quyền <strong>Editor</strong> cho email của Service Account (dạng <code>...gserviceaccount.com</code>).</li>
            </ol>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">3. Thiết lập Ads Autopilot theo CPA</h2>
            <p className="mb-2">Autopilot hoạt động theo cơ chế 3 vùng dữ liệu thông minh:</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 my-3">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="font-semibold text-zinc-900">Vùng chưa đủ data</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Chi tiêu chưa đạt ngưỡng tối thiểu (mặc định 120% CPA mục tiêu) → Hệ thống bỏ qua, không can thiệp.
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="font-semibold text-amber-900">Vùng AI đánh giá</div>
                <div className="mt-1 text-xs text-amber-700">
                  CPA nằm giữa mục tiêu và mức tối đa → Gọi AI (Gemini/OpenAI) phân tích xu hướng và quyết định giữ hay tắt.
                </div>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="font-semibold text-red-900">Vùng vượt ngưỡng tối đa</div>
                <div className="mt-1 text-xs text-red-700">
                  CPA vượt ngưỡng tối đa (mặc định &gt; 200%) → Lập tức tắt quảng cáo, báo Telegram và clone camp mới nếu bật.
                </div>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">4. Kết nối Claude Desktop / Cursor qua MCP</h2>
            <p className="mb-2">AdsSync cung cấp giao thức Model Context Protocol chuẩn:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Vào mục <em>MCP</em> → Bấm <em>+ Thêm API Key</em> → Chọn phạm vi nền tảng được phép đọc/ghi.</li>
              <li>Sao chép Connector URL (dạng <code>http://localhost:3000/mcp?key=...</code>).</li>
              <li>
                Dán vào cấu hình <code>claude_desktop_config.json</code>:
                <pre className="mt-2 rounded bg-zinc-900 p-3 text-xs text-zinc-200 overflow-x-auto">
{`{
  "mcpServers": {
    "adssync": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-fetch", "http://localhost:3000/mcp?key=YOUR_API_KEY"]
    }
  }
}`}
                </pre>
              </li>
              <li>Mọi thao tác ghi (tắt ads, đổi ngân sách) từ AI sẽ tự động tạo yêu cầu duyệt trong tab Phê duyệt.</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

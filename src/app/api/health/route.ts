// Health check cho desktop shell (chờ server sẵn sàng) và cho giám sát self-host.
// Cũng là điểm bật scheduler chạy trong process: PGlite chỉ cho 1 process mở dữ liệu
// nên worker không thể chạy thành process riêng khi server đang giữ thư mục dữ liệu.
import { startInProcessWorker } from "@/lib/worker-inproc";
import { isLoopbackRequest } from "@/lib/request-origin";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

// Sidecar desktop chạy `node server.js` nên không có npm_package_version —
// đọc thẳng package.json cạnh server (standalone) để báo đúng phiên bản.
function appVersion(): string {
  if (process.env.npm_package_version) return process.env.npm_package_version;
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    if (pkg?.version) return String(pkg.version);
  } catch {
    /* bỏ qua — dùng fallback */
  }
  return "0.2.0";
}

export async function GET(req: Request) {
  if (process.env.ADSYNC_INPROC_WORKER === "1") {
    startInProcessWorker(console.log);
  }

  const local = isLoopbackRequest(req);
  return Response.json({
    ok: true,
    app: "adsync",
    version: appVersion(),
    worker: process.env.ADSYNC_INPROC_WORKER === "1",
    uptime_s: Math.round(process.uptime()),
    ...(local
      ? {
          pid: process.pid,
          data_dir: process.env.ADSYNC_DATA_DIR ?? null,
          mock: process.env.ADSYNC_MOCK !== "0",
          real_writes: process.env.ADSYNC_REAL_WRITES === "1",
        }
      : {}),
  });
}

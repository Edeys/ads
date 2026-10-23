// Cổng an toàn duy nhất cho mọi lệnh GHI lên nền tảng quảng cáo.
//
// Bản desktop mặc định chạy mock/read-only. Kể cả khi đã kết nối tài khoản thật,
// mọi lệnh thay đổi trạng thái/ngân sách/đăng bài phải được bật tường minh bằng
// ADSYNC_REAL_WRITES=1 trong mode.env (và vẫn phải qua Approval Gate ở UI).
//
// Đặt guard ở tầng helper (không chỉ ở route) để worker, MCP tools và mọi luồng
// nội bộ đều không thể vô tình ghi thật.
export function realWritesEnabled(): boolean {
  return process.env.ADSYNC_REAL_WRITES === "1";
}

export function assertRealWrites(action: string): void {
  if (!realWritesEnabled()) {
    throw new Error(
      `Đã chặn lệnh ghi "${action}" vì app đang ở chế độ an toàn (ADSYNC_REAL_WRITES=0). ` +
        "Bật ghi thật trong %APPDATA%\\AdsSync\\mode.env rồi khởi động lại app.",
    );
  }
}

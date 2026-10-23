"use client";

/**
 * Mở một URL bên ngoài cửa sổ app.
 *
 * Vì sao không dùng `<a href>`: trong bản desktop, webview tải trang từ
 * 127.0.0.1 nên điều hướng tới nhà cung cấp OAuth (facebook.com,
 * accounts.google.com) sẽ chạy trong chính webview đó. Facebook và Google đều
 * chặn user-agent của webview nhúng và hiện trang lỗi "Sorry, something went
 * wrong" thay vì màn hình đăng nhập. Vì vậy phải mở tab trình duyệt hệ thống.
 *
 * Trên bản web, hành vi đúng là điều hướng cửa sổ hiện tại (giữ được luồng
 * redirect về app), nên chỉ khi chạy trong Tauri mới mở cửa sổ ngoài.
 */
export function openExternal(url: string) {
  const tauri = (window as any).__TAURI__;
  const internals = (window as any).__TAURI_INTERNALS__;

  if (tauri?.core?.invoke) {
    tauri.core.invoke("open_external", { url }).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
    return;
  }
  if (internals?.invoke) {
    internals.invoke("open_external", { url }).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
    return;
  }

  // Bản web: mở tab mới để không mất trạng thái của trang hiện tại.
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Chạy một lệnh IPC của Tauri nếu đang chạy trong desktop shell. */
export async function invokeTauri(cmd: string, args?: Record<string, unknown>) {
  const tauri = (window as any).__TAURI__;
  const internals = (window as any).__TAURI_INTERNALS__;
  if (tauri?.core?.invoke) return tauri.core.invoke(cmd, args);
  if (internals?.invoke) return internals.invoke(cmd, args);
  throw new Error("Không tìm thấy Tauri IPC");
}

/** true khi app đang chạy trong desktop shell (Tauri). */
export function isDesktopShell(): boolean {
  return Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__);
}

fn main() {
    // BCryptGenRandom dùng để sinh secret NextAuth (32 byte ngẫu nhiên).
    #[cfg(target_os = "windows")]
    {
        println!("cargo:rustc-link-lib=bcrypt");
    }

    // Khai báo app command để Tauri sinh permission "allow-open-external".
    // Bắt buộc: webview tải từ origin remote (http://127.0.0.1:3210) nên lệnh IPC
    // của app bị ACL chặn nếu không có permission tương ứng.
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(&["open_external"]));

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}

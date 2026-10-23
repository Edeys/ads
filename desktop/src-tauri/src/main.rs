// AdsSync desktop shell (Tauri 2)
//
// Luồng chạy:
//   1. Chọn cổng trống, chuẩn bị thư mục dữ liệu %APPDATA%\AdsSync
//   2. Chạy `bootstrap.mjs` (áp migration PGlite) — phải xong trước khi mở server
//   3. Spawn Node sidecar chạy Next standalone (server.js)
//   4. Poll /api/health → POST /api/dev/bootstrap (seed lõi) → điều hướng webview
//   5. Thoát app thì kill server
//
// PGlite chỉ cho MỘT process mở thư mục dữ liệu, nên worker chạy trong chính
// process server (ADSYNC_INPROC_WORKER=1, bật từ route /api/health).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};

/// Khoá 1 instance duy nhất cho toàn hệ thống (mutex có tên của Windows).
///
/// Bắt buộc vì PGlite chỉ chịu được MỘT process mở thư mục dữ liệu; mở 2 cửa sổ
/// AdsSync sẽ khiến 2 server cùng ghi cùng một database.
#[cfg(windows)]
mod single_instance {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicPtr, Ordering};

    const ERROR_ALREADY_EXISTS: u32 = 183;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateMutexW(attrs: *const c_void, initial_owner: i32, name: *const u16) -> *mut c_void;
        fn GetLastError() -> u32;
    }

    static HANDLE: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

    /// `Ok(())` nếu đây là instance đầu tiên, `Err(msg)` nếu đã có instance khác.
    pub fn acquire(name: &str) -> Result<(), String> {
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        let handle = unsafe { CreateMutexW(std::ptr::null(), 1, wide.as_ptr()) };
        if handle.is_null() {
            // Không tạo được mutex: không chặn app, chỉ ghi cảnh báo.
            return Err(format!(
                "Không tạo được khoá instance (CreateMutexW lỗi {})",
                unsafe { GetLastError() }
            ));
        }
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            return Err(
                "AdsSync đang chạy: một cửa sổ khác đã mở. Hãy dùng cửa sổ đó (chỉ một tiến trình được mở dữ liệu PGlite)."
                    .to_string(),
            );
        }
        HANDLE.store(handle, Ordering::SeqCst); // giữ handle suốt vòng đời tiến trình
        Ok(())
    }
}

#[cfg(not(windows))]
mod single_instance {
    pub fn acquire(_name: &str) -> Result<(), String> {
        Ok(())
    }
}

/// Hộp thoại lỗi native (Windows). Bản khác Windows chỉ ghi ra log.
fn show_error_dialog(title: &str, message: &str) {
    #[cfg(windows)]
    {
        use std::ffi::c_void;
        #[link(name = "user32")]
        extern "system" {
            fn MessageBoxW(hwnd: *mut c_void, text: *const u16, caption: *const u16, flags: u32) -> i32;
        }
        const MB_OK: u32 = 0x0000_0000;
        const MB_ICONERROR: u32 = 0x0000_0010;
        let t: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        let m: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                m.as_ptr(),
                t.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (title, message);
    }
}

struct ServerState {
    child: Mutex<Option<Child>>,
}

impl ServerState {
    fn kill(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

struct Launch {
    node: PathBuf,
    app_dir: PathBuf,
    data_dir: PathBuf,
    secret: String,
    log: PathBuf,
    /// Cấu hình OAuth đọc từ `%APPDATA%\AdsSync\oauth.env` (key, value).
    config: Vec<(String, String)>,
}

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(3123)
}

/// Cổng cố định cho bản desktop.
///
/// OAuth (Meta/TikTok/Google) yêu cầu `redirect_uri` khớp CHÍNH XÁC với URI đã
/// đăng ký, nên cổng phải ổn định giữa các lần mở app. Nếu cổng đang bị chiếm
/// thì lùi về cổng ngẫu nhiên (khi đó OAuth sẽ cần đăng ký lại, các luồng
/// nhập token thủ công vẫn chạy bình thường).
const DEFAULT_PORT: u16 = 3210;

fn port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn choose_port() -> u16 {
    if let Ok(custom) = std::env::var("ADSYNC_PORT") {
        if let Ok(p) = custom.trim().parse::<u16>() {
            if p > 0 && port_free(p) {
                return p;
            }
        }
    }
    if port_free(DEFAULT_PORT) {
        return DEFAULT_PORT;
    }
    free_port()
}

fn http_get_ok(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    match TcpStream::connect(&addr) {
        Ok(mut stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
            let req = format!("GET /api/health HTTP/1.0\r\nHost: {addr}\r\nConnection: close\r\n\r\n");
            if stream.write_all(req.as_bytes()).is_err() {
                return false;
            }
            let mut buf = String::new();
            if stream.read_to_string(&mut buf).is_err() {
                return false;
            }
            buf.starts_with("HTTP/1.0 200") || buf.starts_with("HTTP/1.1 200")
        }
        Err(_) => false,
    }
}

/// POST rỗng tới /api/dev/bootstrap để seed lõi (idempotent).
fn post_bootstrap(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    match TcpStream::connect(&addr) {
        Ok(mut stream) => {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(20_000)));
            let req = format!(
                "POST /api/dev/bootstrap HTTP/1.0\r\nHost: {addr}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(req.as_bytes()).is_err() {
                return false;
            }
            let mut buf = String::new();
            let _ = stream.read_to_string(&mut buf);
            buf.starts_with("HTTP/1.0 200") || buf.starts_with("HTTP/1.1 200")
        }
        Err(_) => false,
    }
}

/// Tauri trả về đường dẫn dạng `\\?\D:\...` (extended-length path) trên Windows.
/// Node/libuv không parse được dạng này trong argv (lỗi "lstat 'D:'"), nên bỏ prefix.
fn strip_verbatim(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy().to_string();
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        if let Some(unc) = rest.strip_prefix(r"UNC\") {
            return PathBuf::from(format!(r"\\{unc}"));
        }
        return PathBuf::from(rest);
    }
    path
}

fn app_dir_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();

    if let Ok(custom) = std::env::var("ADSYNC_APP_DIR") {
        out.push(PathBuf::from(custom));
    }
    if let Ok(dir) = app.path().resource_dir() {
        let dir = strip_verbatim(dir);
        out.push(dir.join("resources").join("app"));
        out.push(dir.join("app"));
        out.push(dir.join("_up_").join("resources").join("app"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let parent = strip_verbatim(parent.to_path_buf());
            out.push(parent.join("resources").join("app"));
            out.push(parent.join("app"));
        }
    }
    // Chạy `cargo tauri dev` (chưa bundle): dùng bản stage trong repo.
    out.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources").join("app"));
    out
}

fn node_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    let mut out: Vec<PathBuf> = Vec::new();

    if let Ok(custom) = std::env::var("ADSYNC_NODE_BIN") {
        out.push(PathBuf::from(custom));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            out.push(parent.join(name));
            out.push(parent.join("binaries").join(name));
        }
    }
    if let Ok(dir) = app.path().resource_dir() {
        let dir = strip_verbatim(dir);
        out.push(dir.join("binaries").join(name));
        out.push(dir.join("_up_").join("binaries").join(name));
        out.push(dir.join(name));
    }
    out
}

/// Sinh chuỗi ngẫu nhiên hex (32 byte = 64 ký tự).
///
/// Dùng BCryptGenRandom của Windows (SystemDefaultRNG = null handle).
fn random_hex(bytes: usize) -> Option<String> {
    #[cfg(windows)]
    {
        use std::ffi::c_void;
        extern "system" {
            fn BCryptGenRandom(
                h_algorithm: *mut c_void,
                pb_buffer: *mut u8,
                cb_buffer: u32,
                dw_flags: u32,
            ) -> i32;
        }
        let mut buf = vec![0u8; bytes];
        let ok = unsafe {
            BCryptGenRandom(std::ptr::null_mut(), buf.as_mut_ptr(), bytes as u32, 0)
        } == 0;
        if ok {
            return Some(buf.iter().map(|b| format!("{:02x}", b)).collect());
        }
    }
    None
}

/// Secret dùng cho NextAuth (ký cookie phiên).
///
/// PHẢI ổn định giữa các lần mở app — nếu đổi, mọi phiên đăng nhập cũ sẽ mất hiệu lực.
fn read_or_create_secret(dir: &std::path::Path) -> String {
    let file = dir.join("secret.txt");
    if let Ok(existing) = fs::read_to_string(&file) {
        let trimmed = existing.trim().to_string();
        if trimmed.len() >= 16 {
            return trimmed;
        }
    }
    let secret = random_hex(32).unwrap_or_else(|| {
        format!(
            "{:x}{:x}{:x}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0),
            std::process::id(),
            &secret_ptr_marker()
        )
    });
    let _ = fs::write(&file, &secret);
    log_line(&file.with_extension("log"), "tao secret moi (32 byte hex)");
    secret
}

fn secret_ptr_marker() -> usize {
    let x = 0u8;
    &x as *const u8 as usize
}

/// Ghi 1 dòng chẩn đoán vào file log (app chạy dạng windows_subsystem nên không có console).
fn log_line(log: &std::path::Path, msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log) {
        let _ = writeln!(f, "[desktop] {msg}");
    }
}

/// File cấu hình ứng dụng OAuth (nằm cạnh dữ liệu, không nằm trong thư mục cài).
fn config_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("oauth.env")
}

/// File chế độ dữ liệu: mock hay production, có cho phép ghi thật hay không.
fn mode_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("mode.env")
}

const MODE_TEMPLATE: &str = r#"# AdsSync Desktop — chế độ dữ liệu
# Sửa file này rồi khởi động lại app để áp dụng.
#
# ADSYNC_MOCK=1  : dùng dữ liệu mô phỏng (an toàn, mặc định)
# ADSYNC_MOCK=0  : đọc số liệu thật từ Meta/Google/TikTok Ads
ADSYNC_MOCK=1
#
# ADSYNC_REAL_WRITES=1 : cho phép gửi lệnh ghi thật lên tài khoản quảng cáo.
# Mọi lệnh ghi vẫn phải qua Approval Gate trong app. Mặc định chặn.
ADSYNC_REAL_WRITES=0
"#;

fn ensure_mode_template(data_dir: &std::path::Path) {
    let path = mode_path(data_dir);
    if !path.exists() {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(&path, MODE_TEMPLATE);
    }
}

const CONFIG_TEMPLATE: &str = r#"# AdsSync — cấu hình ứng dụng OAuth (bản desktop)
# Sửa file này rồi khởi động lại app để áp dụng.
# Ngoài ra có thể sửa trực tiếp tại Cài đặt > Kết nối ứng dụng trong app.

# Meta Ads — https://developers.facebook.com/apps  (Valid OAuth Redirect URIs:
#   http://localhost:3210/api/connect/meta/callback)
# Nếu Facebook báo "không sử dụng kết nối bảo mật", tắt Enforce HTTPS trong
# Facebook Login > Settings khi app còn Development mode.
META_APP_ID=
META_APP_SECRET=

# TikTok Ads — https://business-api.tiktok.com/portal/app
TIKTOK_APP_ID=
TIKTOK_APP_SECRET=
# TikTok chi nhan hostname, khong nhan IP (127.0.0.1).
TIKTOK_REDIRECT_URL=http://localhost:3210/api/connect/tiktok/callback

# Google Ads — https://ads.google.com/manager/accounts
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_DEVELOPER_TOKEN=
# Dang nhap Google cua app (dung chung client voi Google Ads duoc)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
"#;

/// Tạo file cấu hình mẫu ở lần chạy đầu (để người dùng biết cần điền gì).
fn ensure_config_template(data_dir: &std::path::Path) {
    let path = config_path(data_dir);
    if path.exists() {
        return;
    }
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&path, CONFIG_TEMPLATE);
}

/// Đọc file dạng KEY=VALUE (bỏ qua dòng trống và dòng `#`).
fn load_env_file(path: &std::path::Path) -> Vec<(String, String)> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut out: Vec<(String, String)> = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim().trim_matches('"').trim_matches('\'').to_string();
        if key.is_empty() || value.is_empty() {
            continue;
        }
        out.push((key.to_string(), value));
    }
    out
}

fn load_config(data_dir: &std::path::Path) -> Vec<(String, String)> {
    load_env_file(&config_path(data_dir))
}

fn load_mode(data_dir: &std::path::Path) -> Vec<(String, String)> {
    load_env_file(&mode_path(data_dir))
}

fn prepare_launch(app: &tauri::AppHandle) -> Result<Launch, String> {
    let app_dir = app_dir_candidates(app)
        .into_iter()
        .find(|p| p.join("server.js").is_file())
        .ok_or_else(|| "Không tìm thấy server.js — chạy `node desktop/prepare.mjs` trước.".to_string())?;

    let node = node_candidates(app)
        .into_iter()
        .find(|p| p.is_file())
        .unwrap_or_else(|| PathBuf::from(if cfg!(windows) { "node.exe" } else { "node" }));

    let data_dir = app
        .path()
        .data_dir()
        .map_err(|e| format!("Không lấy được thư mục dữ liệu: {e}"))?
        .join("AdsSync");
    fs::create_dir_all(&data_dir).map_err(|e| format!("Không tạo được {data_dir:?}: {e}"))?;

    let secret = read_or_create_secret(&data_dir);
    let log = data_dir.join("server.log");

    // Dọn cache route của Next trong thư mục app: sau khi cập nhật, cache cũ có thể
    // phục vụ HTML cũ (vd trang /login còn nút "Dev login" dù đã bỏ provider dev).
    for sub in [".next/server/route-cache", ".next/cache"] {
        let p = app_dir.join(sub);
        if p.exists() {
            let _ = fs::remove_dir_all(&p);
            log_line(&log, &format!("da xoa cache route: {:?}", p));
        }
    }

    ensure_config_template(&data_dir);
    ensure_mode_template(&data_dir);
    let config = load_config(&data_dir);
    let mode = load_mode(&data_dir);

    log_line(
        &log,
        &format!(
            "launch: app_dir={:?} node={:?} data_dir={:?} config_keys={:?} mode_keys={:?}",
            app_dir,
            node,
            data_dir,
            config.iter().map(|(k, _)| k.clone()).collect::<Vec<_>>(),
            mode.iter().map(|(k, v)| format!("{k}={v}")).collect::<Vec<_>>()
        ),
    );

    Ok(Launch {
        node,
        app_dir,
        data_dir,
        secret,
        log,
        config,
    })
}

/// Áp migration trước khi mở server (chạy đồng bộ, chờ xong).
fn run_migrations(launch: &Launch) -> Result<(), String> {
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&launch.log)
        .map_err(|e| format!("Không mở được log: {e}"))?;
    let log_err = log.try_clone().map_err(|e| format!("Không clone được log: {e}"))?;

    let mut cmd = Command::new(&launch.node);
    // Script truyền TƯƠNG ĐỐI + cwd = app_dir: tránh mọi lỗi argv khi đường dẫn
    // chứa khoảng trắng (AppData/Program Files...).
    cmd.arg("bootstrap.mjs")
        .current_dir(&launch.app_dir)
        .env("ADSYNC_DATA_DIR", &launch.data_dir)
        .env("ADSYNC_MIGRATIONS_DIR", launch.app_dir.join("drizzle"))
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));

    log_line(
        &launch.log,
        &format!("migrate: node={:?} cwd={:?}", launch.node, launch.app_dir),
    );

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let status = cmd.status().map_err(|e| format!("Không chạy được bootstrap: {e}"))?;
    if !status.success() {
        return Err(format!(
            "Migration thất bại (exit {:?}) — xem log tại {:?}",
            status.code(),
            launch.log
        ));
    }
    Ok(())
}

fn rotate_log_if_large(path: &PathBuf) {
    const MAX_LOG_BYTES: u64 = 10 * 1024 * 1024;
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() > MAX_LOG_BYTES {
            let mut backup = path.clone();
            let name = backup
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("server.log")
                .to_string();
            backup.set_file_name(format!("{name}.1"));
            let _ = fs::rename(path, backup);
        }
    }
}

fn spawn_server(launch: &Launch, port: u16) -> Result<Child, String> {
    rotate_log_if_large(&launch.log);
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&launch.log)
        .map_err(|e| format!("Không mở được log: {e}"))?;
    let log_err = log.try_clone().map_err(|e| format!("Không clone được log: {e}"))?;

    let mut cmd = Command::new(&launch.node);
    cmd.arg("server.js")
        .current_dir(&launch.app_dir)
        .env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("ADSYNC_DATA_DIR", &launch.data_dir)
        .env("ADSYNC_MIGRATIONS_DIR", launch.app_dir.join("drizzle"))
        .env("ADSYNC_ALLOW_BOOTSTRAP", "1")
        .env("ADSYNC_INPROC_WORKER", "1")
        .env("NEXTAUTH_SECRET", &launch.secret)
        .env("NEXTAUTH_URL", format!("http://localhost:{port}"))
        // NextAuth v5 đọc AUTH_URL để dựng URL callback; nếu thiếu, nó suy ra từ
        // Host header và có thể ra "localhost" -> lệch với redirect URI đã đăng ký.
        .env("AUTH_URL", format!("http://localhost:{port}"))
        // APP_URL phải khớp đúng origin của webview, nếu không OAuth sẽ redirect
        // về nhầm cổng (và cookie session không được gửi kèm).
        .env("APP_URL", format!("http://127.0.0.1:{port}"))
        .env("AUTH_TRUST_HOST", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));

    // Cấu hình ứng dụng OAuth do người dùng khai trong app (file oauth.env).
    for (key, value) in &launch.config {
        cmd.env(key, value);
    }

    // Chế độ dữ liệu: file mode.env (hoặc biến môi trường của tiến trình cha).
    // Mặc định an toàn: mock=1, real-writes=0.
    let mode = load_mode(&launch.data_dir);
    let mode_value = |key: &str, default: &str| -> String {
        std::env::var(key)
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| mode.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone()))
            .unwrap_or_else(|| default.to_string())
    };
    cmd.env("ADSYNC_MOCK", mode_value("ADSYNC_MOCK", "1"))
        .env("ADSYNC_REAL_WRITES", mode_value("ADSYNC_REAL_WRITES", "0"));

    #[cfg(windows)]
    {
        // Không bật cửa sổ console cho sidecar.
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    log_line(
        &launch.log,
        &format!("server: node={:?} cwd={:?} port={port}", launch.node, launch.app_dir),
    );

    cmd.spawn()
        .map_err(|e| format!("Không chạy được Node ({:?}): {e}", launch.node))
}
/// Mở URL bằng trình duyệt hệ thống (dùng cho Google OAuth — Google chặn webview).
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Chỉ cho phép mở URL http/https".to_string());
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", &url]);
        cmd.creation_flags(0x0800_0000);
        cmd.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        Command::new("xdg-open").arg(&url).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
    date: Option<String>,
}

/// Kiểm tra bản cập nhật từ endpoint GitHub Releases (latest.json).
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone(),
        date: u.date.map(|d| d.to_string()),
    }))
}

/// Tải + cài bản cập nhật rồi khởi động lại app. Không cần người dùng tải installer.
#[tauri::command]
async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(());
    };
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_external,
            check_update,
            install_update
        ])
        .manage(ServerState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // Chỉ cho một instance: PGlite không chịu được 2 process cùng mở dữ liệu.
            if let Err(err) = single_instance::acquire("Local\\AdsSync.Desktop") {
                show_error_dialog("AdsSync", &err);
                std::process::exit(1);
            }

            // Dev UI (Next dev server) nếu có — tiện khi phát triển shell.
            if let Ok(url) = std::env::var("ADSYNC_DEV_URL") {
                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.navigate(url.parse().expect("ADSYNC_DEV_URL không hợp lệ"));
                }
                return Ok(());
            }

            let launch = match prepare_launch(&handle) {
                Ok(l) => l,
                Err(err) => {
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.eval(&format!("window.__adsyncError({err:?})"));
                    }
                    return Ok(());
                }
            };

            if let Err(err) = run_migrations(&launch) {
                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.eval(&format!("window.__adsyncError({err:?})"));
                }
                return Ok(());
            }

            let port = choose_port();
            let state = handle.state::<ServerState>();
            match spawn_server(&launch, port) {
                Ok(child) => {
                    *state.child.lock().unwrap() = Some(child);
                }
                Err(err) => {
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.eval(&format!("window.__adsyncError({err:?})"));
                    }
                    return Ok(());
                }
            }

            std::thread::spawn(move || {
                let url = format!("http://127.0.0.1:{port}");
                let deadline = Instant::now() + Duration::from_secs(120);
                let started = Instant::now();
                let mut tick: u64 = 0;

                while Instant::now() < deadline {
                    if http_get_ok(port) {
                        // Seed lõi (idempotent) rồi mới mở UI.
                        let seeded = post_bootstrap(port);
                        if let Some(win) = handle.get_webview_window("main") {
                            if let Ok(parsed) = url.parse() {
                                let _ = win.navigate(parsed);
                            }
                        }
                        println!("[desktop] server ready on {url} (seed: {seeded})");
                        return;
                    }
                    tick += 1;
                    if tick % 8 == 0 {
                        if let Some(win) = handle.get_webview_window("main") {
                            let secs = started.elapsed().as_secs();
                            let _ = win.eval(&format!("window.__adsyncTick({secs})"));
                        }
                    }
                    std::thread::sleep(Duration::from_millis(400));
                }

                if let Some(win) = handle.get_webview_window("main") {
                    let _ = win.eval(
                        "window.__adsyncError('Server không phản hồi sau 120 giây. Xem log tại %APPDATA%\\\\AdsSync\\\\server.log')",
                    );
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("không build được app Tauri")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                app_handle.state::<ServerState>().kill();
            }
        });
}

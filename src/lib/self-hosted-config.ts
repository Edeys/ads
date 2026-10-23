// Cấu hình ứng dụng OAuth cho bản self-hosted (đặc biệt là bản desktop).
//
// Bản desktop đọc file `%APPDATA%\AdsSync\oauth.env` lúc khởi động và nạp vào
// env của server. File này nằm ngoài thư mục cài đặt nên người dùng sửa được
// mà không đụng tới file của hệ thống.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type ConfigProvider = "meta" | "tiktok" | "google";

/** Chế độ dữ liệu giả. Desktop mặc định bật; đặt ADSYNC_MOCK=0 để chạy production. */
export function mockMode(): boolean {
  return process.env.ADSYNC_MOCK !== "0";
}

/**
 * Chỉ cho phép OAuth sandbox khi:
 *  - đang ở chế độ mock (ADSYNC_MOCK != 0),
 *  - là bản self-hosted,
 *  - người gọi chủ động thêm ?mock=1.
 * Không tự động tạo kết nối giả khi thiếu credential — production sẽ báo lỗi 503.
 */
export function allowMockOAuth(req: Request): boolean {
  if (!mockMode() || process.env.SELF_HOSTED !== "true") return false;
  try {
    return new URL(req.url).searchParams.get("mock") === "1";
  } catch {
    return false;
  }
}

export type ConfigField = {
  key: string;
  label: string;
  provider: ConfigProvider;
  secret: boolean;
  hint?: string;
};

export const OAUTH_CONFIG_FIELDS: ConfigField[] = [
  { key: "META_APP_ID", label: "Meta App ID", provider: "meta", secret: false },
  { key: "META_APP_SECRET", label: "Meta App Secret", provider: "meta", secret: true },
  { key: "TIKTOK_APP_ID", label: "TikTok App ID", provider: "tiktok", secret: false },
  { key: "TIKTOK_APP_SECRET", label: "TikTok App Secret", provider: "tiktok", secret: true },
  {
    key: "TIKTOK_REDIRECT_URL",
    label: "TikTok Redirect URL",
    provider: "tiktok",
    secret: false,
    hint: "TikTok chỉ nhận hostname (không nhận IP 127.0.0.1). Mặc định: http://localhost:3210/api/connect/tiktok/callback",
  },
  { key: "GOOGLE_ADS_CLIENT_ID", label: "Google Ads Client ID", provider: "google", secret: false },
  { key: "GOOGLE_ADS_CLIENT_SECRET", label: "Google Ads Client Secret", provider: "google", secret: true },
  {
    key: "GOOGLE_CLIENT_ID",
    label: "Google Client ID (đăng nhập)",
    provider: "google",
    secret: false,
    hint: "Dùng cho đăng nhập Google của app. Có thể dùng chung Client ID với Google Ads.",
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    label: "Google Client Secret (đăng nhập)",
    provider: "google",
    secret: true,
    hint: "Cần cho luồng đăng nhập Google của app.",
  },
  {
    key: "GOOGLE_ADS_DEVELOPER_TOKEN",
    label: "Google Ads Developer Token",
    provider: "google",
    secret: true,
    hint: "Bắt buộc để đọc số liệu Google Ads (không dùng cho bước OAuth).",
  },
  {
    key: "OPENAI_CLIENT_ID",
    label: "OpenAI Client ID (đăng nhập ChatGPT)",
    provider: "google",
    secret: false,
    hint: "Tạo OAuth app tại platform.openai.com. Bật nút đăng nhập bằng ChatGPT trong app.",
  },
  {
    key: "OPENAI_CLIENT_SECRET",
    label: "OpenAI Client Secret (đăng nhập ChatGPT)",
    provider: "google",
    secret: true,
    hint: "Dùng cho luồng đăng nhập bằng tài khoản ChatGPT.",
  },
];

export const PROVIDER_LABELS: Record<ConfigProvider, string> = {
  meta: "Meta Ads",
  tiktok: "TikTok Ads",
  google: "Google Ads",
};

/** Thư mục dữ liệu runtime (bản desktop đặt qua ADSYNC_DATA_DIR). */
export function configDir(): string | null {
  const dir = process.env.ADSYNC_DATA_DIR?.trim();
  return dir ? dir : null;
}

/** Đường dẫn file cấu hình (null nếu không chạy trong runtime có thể ghi). */
export function configFile(): string | null {
  const dir = configDir();
  return dir ? join(dir, "oauth.env") : null;
}

/** Bản desktop có thể tự ghi file cấu hình; bản web chạy từ repo thì không. */
export function canWriteConfig(): boolean {
  const file = configFile();
  return Boolean(file && existsSync(file));
}

export function currentAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/**
 * Origin cho route handler. Ưu tiên APP_URL (bản desktop đặt đúng 127.0.0.1:3210),
 * nếu thiếu thì suy ra từ request — tránh trường hợp server chạy cổng 3210 nhưng
 * OAuth lại redirect về localhost:3000 không tồn tại.
 */
export function requestAppUrl(req: Request): string {
  const env = process.env.APP_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}`.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

/**
 * Facebook Login coi http://127.0.0.1 là kết nối không bảo mật và chặn
 * ("không sử dụng kết nối bảo mật"), trong khi http://localhost được miễn trừ
 * ở Development mode. Đổi hostname của origin loopback sang localhost nhưng
 * giữ nguyên cổng.
 */
export function loopbackHostnameUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname === "127.0.0.1" || u.hostname === "::1" || u.hostname === "[::1]") {
      u.hostname = "localhost";
    }
    return u.origin;
  } catch {
    return raw.replace(/\/$/, "");
  }
}

/**
 * Origin dùng cho luồng đăng nhập (NextAuth).
 *
 * Server Next chuẩn hoá 127.0.0.1 thành "localhost" khi dựng URL callback, nên
 * cookie PKCE/CSRF phải được set và đọc trên CÙNG một origin — nếu không sẽ
 * lỗi "pkceCodeVerifier value could not be parsed". Vì vậy luồng đăng nhập dùng
 * NEXTAUTH_URL (localhost), còn luồng OAuth nền tảng quảng cáo dùng APP_URL.
 */
export function authBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Redirect URI phải khớp chính xác URI đã đăng ký ở nhà cung cấp. */
export function redirectUriForBase(provider: ConfigProvider, baseUrl: string): string {
  const base = provider === "meta" ? loopbackHostnameUrl(baseUrl) : baseUrl.replace(/\/$/, "");
  return `${base}/api/connect/${provider}/callback`;
}

export function redirectUri(provider: ConfigProvider): string {
  return redirectUriForBase(provider, currentAppUrl());
}

/** Như redirectUri nhưng suy ra origin của request hiện tại. */
export function requestRedirectUri(req: Request, provider: ConfigProvider): string {
  return redirectUriForBase(provider, requestAppUrl(req));
}

/** Giá trị đang chạy (đã nạp vào env của server). */
export function currentValues(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of OAUTH_CONFIG_FIELDS) {
    const v = process.env[f.key];
    if (v) out[f.key] = v;
  }
  return out;
}

export function maskValue(value?: string): string {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

/** Ghi giá trị vào file cấu hình, giữ nguyên phần chú thích và key khác. */
export function writeConfigValues(values: Record<string, string>): string {
  const file = configFile();
  if (!file) {
    throw new Error("Bản web không ghi được file cấu hình — hãy đặt biến trong .env.local rồi khởi động lại server.");
  }
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const lines = text.split(/\r?\n/);
  for (const [key, value] of Object.entries(values)) {
    const idx = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    const line = `${key}=${value}`;
    if (idx >= 0) lines[idx] = line;
    else lines.push(line);
  }
  writeFileSync(file, lines.join("\n"), "utf8");
  return file;
}

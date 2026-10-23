// Các provider đăng nhập được hỗ trợ.
//
// Tách riêng vì Next chỉ cho export handler từ file route.ts — constant và
// hàm kiểm tra phải nằm ở module khác.
export const LOGIN_PROVIDERS = ["google", "openai"] as const;
export type LoginProvider = (typeof LOGIN_PROVIDERS)[number];

/** Kiểm tra chuỗi có phải provider đăng nhập hợp lệ không. */
export function isLoginProvider(v: string | null | undefined): v is LoginProvider {
  return !!v && (LOGIN_PROVIDERS as readonly string[]).includes(v);
}

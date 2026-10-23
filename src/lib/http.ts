// fetch có timeout mặc định cho mọi lời gọi ra nhà cung cấp.
//
// Provider API có thể treo vô hạn (DNS lỗi, kết nối half-open), làm route OAuth
// hoặc worker đứng mãi. Wrapper này giữ nguyên signal nếu caller đã truyền, còn
// không thì tự đặt AbortSignal.timeout.
const DEFAULT_TIMEOUT_MS = 20_000;

export function fetchT(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}

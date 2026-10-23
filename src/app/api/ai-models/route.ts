export const runtime = "nodejs";

/**
 * Danh mục model AI mà app local hỗ trợ (dùng cho select trong Cấu hình Autopilot,
 * bình luận AI, báo cáo). Không gọi mạng — chỉ là metadata.
 */
const PROVIDERS = [
  {
    provider: "openai",
    label: "OpenAI",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", context: 128000, cheap: true },
      { id: "gpt-4o", label: "GPT-4o", context: 128000, cheap: false },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini", context: 1000000, cheap: true },
    ],
  },
  {
    provider: "gemini",
    label: "Google Gemini",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", context: 1000000, cheap: true },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", context: 2000000, cheap: false },
    ],
  },
  {
    provider: "anthropic",
    label: "Anthropic",
    models: [
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", context: 200000, cheap: true },
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", context: 200000, cheap: false },
    ],
  },
  {
    provider: "deepseek",
    label: "DeepSeek",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", context: 128000, cheap: true },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", context: 128000, cheap: false },
    ],
  },
] as const;

// GET /api/ai-models
export async function GET() {
  return Response.json({ providers: PROVIDERS });
}

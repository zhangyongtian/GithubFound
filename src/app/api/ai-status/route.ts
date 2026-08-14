import { NextRequest } from "next/server";
import { isAIEnabled, detectProvider } from "@/lib/llm";
import { applyReqSettings } from "@/lib/applyReqSettings";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  applyReqSettings(req);
  let provider: string | undefined;
  let model: string | undefined;
  let displayName = "未配置";
  let selected: string = "auto";
  let error: string | undefined;

  try {
    const cfg = detectProvider();
    provider = cfg.provider === "none" ? undefined : cfg.provider;
    model = cfg.model || undefined;
    selected = cfg.selected;
    if (provider) {
      const p = (cfg.provider || "ai").toLowerCase();
      const baseName = p.includes("agnes")
        ? "Agnes"
        : p.includes("dashscope")
          ? "千问"
          : p.includes("deepseek")
            ? "DeepSeek"
            : p.includes("openai")
              ? "GPT"
              : p.includes("anthropic")
                ? "Claude"
                : p.includes("google")
                  ? "Gemini"
                  : p.includes("openrouter")
                    ? "OpenRouter"
                    : cfg.provider || "AI";
      displayName = baseName;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return Response.json({
    enabled: !!provider,
    provider,
    model,
    displayName,
    selected,
    error,
  });
}

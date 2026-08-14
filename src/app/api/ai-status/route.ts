import { NextRequest } from "next/server";
import { detectProvider } from "@/lib/llm";
import { applyReqSettings } from "@/lib/applyReqSettings";
import { SETTINGS_FIELDS, type SettingsKey } from "@/lib/settingsShared";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const applied = applyReqSettings(req);
  let provider: string | undefined;
  let model: string | undefined;
  let displayName = "未配置";
  let selected: string = "auto";
  let error: string | undefined;

  const AGNES_DEFAULT_KEY = "sk-Qfal9xUmJOVLppj64WEbaq9oD4rachChk8li7R44YdPpMIF6";
  const AGNES_DEFAULT_MODEL = "agnes-2.0-flash";
  const AGNES_DEFAULT_BASE = "https://apihub.agnes-ai.com/v1";

  const userConfiguredKeys: SettingsKey[] = [];
  const nonLLM: readonly SettingsKey[] = ["GITHUB_TOKEN", "SELECTED_PROVIDER"] as const;
  for (const s of SETTINGS_FIELDS) {
    for (const f of s.fields) {
      if (nonLLM.includes(f.key)) continue;
      const v = process.env[f.key];
      if (typeof v !== "string" || v.trim().length === 0) continue;
      if (s.provider === "agnes" && f.key === "AGNES_API_KEY" && v === AGNES_DEFAULT_KEY) continue;
      if (s.provider === "agnes" && f.key === "AGNES_MODEL" && v === AGNES_DEFAULT_MODEL) continue;
      if (s.provider === "agnes" && f.key === "AGNES_BASE_URL" && v === AGNES_DEFAULT_BASE) continue;
      userConfiguredKeys.push(f.key);
    }
  }

  const envAgnesIsUserOverride: boolean =
    Boolean((process.env.AGNES_API_KEY || "").trim()) &&
    (process.env.AGNES_API_KEY || "").trim() !== AGNES_DEFAULT_KEY;

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

  const configured = userConfiguredKeys.length > 0;
  const agnesFallback = provider === "agnes" && !configured;
  if (agnesFallback) {
    displayName += "（兜底免费模式，建议配置自己的 Key）";
  }

  const allKeys = (Object.keys(applied) as SettingsKey[]).filter(
    (k) => !nonLLM.includes(k) && typeof applied[k] === "string" && (applied[k] as string).trim().length > 0,
  );

  let usedFrom: DetectRespFromServer["usedFrom"] = "none";
  if (configured) {
    usedFrom = allKeys.length > 0 ? "localStorage" : envAgnesIsUserOverride ? "localStorage" : "server_env";
  } else if (agnesFallback) {
    usedFrom = "server_env_fallback";
  } else if (provider) {
    usedFrom = "server_env";
  }

  type DetectRespFromServer = {
    enabled: boolean;
    configured: boolean;
    agnesFallback: boolean;
    provider?: string;
    model?: string;
    displayName: string;
    selected: string;
    error?: string;
    usedFrom: "localStorage" | "server_env" | "server_env_fallback" | "none";
    effectiveKeys: string[];
  };
  const out: DetectRespFromServer = {
    enabled: !!provider,
    configured,
    agnesFallback,
    provider,
    model,
    displayName,
    selected,
    error,
    usedFrom,
    effectiveKeys: userConfiguredKeys,
  };
  return Response.json(out);
}

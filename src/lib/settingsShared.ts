export type SettingsKey =
  | "GITHUB_TOKEN"
  | "SELECTED_PROVIDER"
  | "AGNES_API_KEY"
  | "AGNES_MODEL"
  | "AGNES_BASE_URL"
  | "DASHSCOPE_API_KEY"
  | "DASHSCOPE_MODEL"
  | "DASHSCOPE_BASE_URL"
  | "DEEPSEEK_API_KEY"
  | "DEEPSEEK_MODEL"
  | "DEEPSEEK_BASE_URL"
  | "OPENAI_API_KEY"
  | "OPENAI_MODEL"
  | "OPENAI_BASE_URL"
  | "ANTHROPIC_API_KEY"
  | "ANTHROPIC_MODEL"
  | "GOOGLE_API_KEY"
  | "GOOGLE_MODEL"
  | "OPENROUTER_API_KEY"
  | "OPENROUTER_MODEL";

export type ProviderKey = "auto" | "agnes" | "dashscope" | "deepseek" | "openai" | "anthropic" | "google" | "openrouter";

export const PROVIDER_OPTIONS: Array<{
  key: ProviderKey;
  label: string;
  emoji: string;
  help: string;
  keys: SettingsKey[];
  defaults?: Partial<Record<SettingsKey, string>>;
}> = [
  {
    key: "auto",
    label: "自动（按优先级）",
    emoji: "🤖",
    help: "按「Agnes > 千问 > DeepSeek > GPT > Claude > Gemini > OpenRouter」挑第一组可用的",
    keys: [],
  },
  {
    key: "agnes",
    label: "Agnes 聚合",
    emoji: "🆓",
    help: "默认免费模型，开箱即用；选了这个就会只走 Agnes /v1/chat/completions",
    keys: ["AGNES_API_KEY", "AGNES_MODEL", "AGNES_BASE_URL"],
  },
  {
    key: "dashscope",
    label: "阿里 千问",
    emoji: "🤖",
    help: "DashScope 兼容模式，国内稳定",
    keys: ["DASHSCOPE_API_KEY", "DASHSCOPE_MODEL", "DASHSCOPE_BASE_URL"],
  },
  {
    key: "deepseek",
    label: "DeepSeek",
    emoji: "🌌",
    help: "性价比高的推理模型",
    keys: ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_BASE_URL"],
  },
  {
    key: "openai",
    label: "OpenAI / GPT",
    emoji: "🧠",
    help: "官方 GPT 或任何兼容接口（可配 Base URL 中转）",
    keys: ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL"],
  },
  {
    key: "anthropic",
    label: "Claude",
    emoji: "🟣",
    help: "Anthropic 官方接口",
    keys: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"],
  },
  {
    key: "google",
    label: "Gemini",
    emoji: "💎",
    help: "Google AI Studio 免费 Key 也能用",
    keys: ["GOOGLE_API_KEY", "GOOGLE_MODEL"],
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    emoji: "🛰",
    help: "多模型聚合，model 字段形如 openai/gpt-4o-mini",
    keys: ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"],
  },
];

export type SettingsMap = Partial<Record<SettingsKey, string>>;

export const SETTINGS_FIELDS: Array<{
  section: string;
  provider: string;
  hint?: string;
  fields: Array<{
    key: SettingsKey;
    label: string;
    placeholder?: string;
    type?: "password" | "text";
    help?: string;
  }>;
}> = [
  {
    section: "🔑 GitHub 访问（可选）",
    provider: "github",
    hint: "不填也能使用，但未配置时 GitHub API 速率限制为 60 次/小时；配置后可达 5000 次/小时。",
    fields: [
      {
        key: "GITHUB_TOKEN",
        label: "GitHub Personal Access Token",
        type: "password",
        placeholder: "ghp_xxxxxxxxxxxxxxxx",
        help: "勾选 public_repo 权限即可 · 申请地址 github.com/settings/tokens",
      },
    ],
  },
  {
    section: "🆓 Agnes 聚合（默认免费，开箱即用）",
    provider: "agnes",
    hint: "配置写在应用里，开箱就能用；你也可以在下面覆盖为自己的 Key。",
    fields: [
      { key: "AGNES_API_KEY", label: "Agnes API Key（默认免费版）", type: "password", placeholder: "sk-Qfal9xUmJOVLppj64WEbaq9oD4rachChk8li7R44YdPpMIF6" },
      { key: "AGNES_MODEL", label: "模型名", type: "text", placeholder: "agnes-2.0-flash" },
      { key: "AGNES_BASE_URL", label: "Base URL", type: "text", placeholder: "https://apihub.agnes-ai.com/v1" },
    ],
  },
  {
    section: "🤖 阿里 千问 DashScope（优先级第 2）",
    provider: "dashscope",
    fields: [
      { key: "DASHSCOPE_API_KEY", label: "DashScope API Key", type: "password", placeholder: "sk-xxxxxxxx" },
      { key: "DASHSCOPE_MODEL", label: "模型名", type: "text", placeholder: "qwen-plus（默认）" },
      { key: "DASHSCOPE_BASE_URL", label: "Base URL", type: "text", placeholder: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
    ],
  },
  {
    section: "🌌 DeepSeek（深度求索）",
    provider: "deepseek",
    fields: [
      { key: "DEEPSEEK_API_KEY", label: "DeepSeek API Key", type: "password", placeholder: "sk-xxxxxxxx" },
      { key: "DEEPSEEK_MODEL", label: "模型名", type: "text", placeholder: "deepseek-chat（默认）" },
      { key: "DEEPSEEK_BASE_URL", label: "Base URL（可填第三方中转）", type: "text", placeholder: "https://api.deepseek.com/v1" },
    ],
  },
  {
    section: "🧠 OpenAI / GPT",
    provider: "openai",
    fields: [
      { key: "OPENAI_API_KEY", label: "OpenAI API Key", type: "password", placeholder: "sk-xxxxxxxx" },
      { key: "OPENAI_MODEL", label: "模型名", type: "text", placeholder: "gpt-4o-mini（默认）" },
      { key: "OPENAI_BASE_URL", label: "Base URL（可填第三方中转）", type: "text", placeholder: "留空使用官方地址" },
    ],
  },
  {
    section: "🟣 Anthropic Claude",
    provider: "anthropic",
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", type: "password", placeholder: "sk-ant-xxxxxxxx" },
      { key: "ANTHROPIC_MODEL", label: "模型名", type: "text", placeholder: "claude-3-5-haiku-latest（默认）" },
    ],
  },
  {
    section: "💎 Google Gemini",
    provider: "google",
    fields: [
      { key: "GOOGLE_API_KEY", label: "Google AI Studio API Key", type: "password", placeholder: "xxxxxxxx" },
      { key: "GOOGLE_MODEL", label: "模型名", type: "text", placeholder: "gemini-2.0-flash（默认）" },
    ],
  },
  {
    section: "🛰 OpenRouter（多模型聚合）",
    provider: "openrouter",
    fields: [
      { key: "OPENROUTER_API_KEY", label: "OpenRouter API Key", type: "password", placeholder: "sk-or-v1-xxxxxxxx" },
      { key: "OPENROUTER_MODEL", label: "模型名", type: "text", placeholder: "openai/gpt-4o-mini（默认）" },
    ],
  },
];

export function encodeSettingsHeader(map: SettingsMap): string | null {
  const entries: SettingsMap = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "string" && v.trim().length > 0) entries[k as SettingsKey] = v.trim();
  }
  const keys = Object.keys(entries);
  if (keys.length === 0) return null;
  try {
    const json = JSON.stringify(entries);
    if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64");
    if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(json)));
    return null;
  } catch {
    return null;
  }
}

export function decodeSettingsHeader(header: string | null | undefined): SettingsMap {
  if (!header) return {};
  try {
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(header, "base64").toString("utf8")
        : typeof atob === "function"
          ? decodeURIComponent(escape(atob(header)))
          : null;
    if (!json) return {};
    const parsed = JSON.parse(json) as SettingsMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

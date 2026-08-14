import { withCache, deleteCache } from "./cache";
import type { ProviderKey } from "./settingsShared";

type Provider = Exclude<ProviderKey, "auto"> | "none";

interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export function detectProvider(
  forced?: ProviderKey | null
): ProviderConfig & { selected: ProviderKey | "auto" } {
  const AGNES_DEFAULT_KEY = "sk-Qfal9xUmJOVLppj64WEbaq9oD4rachChk8li7R44YdPpMIF6";
  const AGNES_DEFAULT_MODEL = "agnes-2.0-flash";
  const AGNES_DEFAULT_BASE = "https://apihub.agnes-ai.com/v1";
  const selected: ProviderKey | "auto" =
    forced === "agnes" ||
    forced === "dashscope" ||
    forced === "deepseek" ||
    forced === "openai" ||
    forced === "anthropic" ||
    forced === "google" ||
    forced === "openrouter"
      ? forced
      : ((process.env.SELECTED_PROVIDER as ProviderKey | undefined) || "auto");

  const only = (p: ProviderKey | "auto"): ProviderKey | "auto" =>
    p === "auto" ? "auto" : p;
  const pick = <T>(p: ProviderKey, ok: boolean, val: () => ProviderConfig): ProviderConfig | null => {
    if (only(selected) !== "auto" && only(selected) !== p) return null;
    if (!ok) {
      if (only(selected) === p) return val(); // 用户强制选了就返回，让调用方去抛错
      return null;
    }
    return val();
  };

  const agnesKey = (process.env.AGNES_API_KEY || "").trim() || AGNES_DEFAULT_KEY;
  const pAgnes = pick("agnes", Boolean(agnesKey), () => ({
    provider: "agnes" as const,
    apiKey: agnesKey,
    model: (process.env.AGNES_MODEL || "").trim() || AGNES_DEFAULT_MODEL,
    baseUrl: (process.env.AGNES_BASE_URL || "").trim() || AGNES_DEFAULT_BASE,
  }));
  if (pAgnes) return { ...pAgnes, selected: only(selected) };
  const pDash = pick("dashscope", Boolean(process.env.DASHSCOPE_API_KEY), () => ({
    provider: "dashscope" as const,
    apiKey: process.env.DASHSCOPE_API_KEY as string,
    model: process.env.DASHSCOPE_MODEL || "qwen-plus",
    baseUrl:
      process.env.DASHSCOPE_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  }));
  if (pDash) return { ...pDash, selected: only(selected) };
  const pDeep = pick("deepseek", Boolean(process.env.DEEPSEEK_API_KEY), () => ({
    provider: "deepseek" as const,
    apiKey: process.env.DEEPSEEK_API_KEY as string,
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  }));
  if (pDeep) return { ...pDeep, selected: only(selected) };
  const pOpen = pick("openai", Boolean(process.env.OPENAI_API_KEY), () => ({
    provider: "openai" as const,
    apiKey: process.env.OPENAI_API_KEY as string,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  }));
  if (pOpen) return { ...pOpen, selected: only(selected) };
  const pAnth = pick("anthropic", Boolean(process.env.ANTHROPIC_API_KEY), () => ({
    provider: "anthropic" as const,
    apiKey: process.env.ANTHROPIC_API_KEY as string,
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
  }));
  if (pAnth) return { ...pAnth, selected: only(selected) };
  const pGoo = pick("google", Boolean(process.env.GOOGLE_API_KEY), () => ({
    provider: "google" as const,
    apiKey: process.env.GOOGLE_API_KEY as string,
    model: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
  }));
  if (pGoo) return { ...pGoo, selected: only(selected) };
  const pOr = pick("openrouter", Boolean(process.env.OPENROUTER_API_KEY), () => ({
    provider: "openrouter" as const,
    apiKey: process.env.OPENROUTER_API_KEY as string,
    model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  }));
  if (pOr) return { ...pOr, selected: only(selected) };
  return { provider: "none", apiKey: "", model: "", selected: only(selected) };
}

function buildPrompt(
  owner: string,
  repo: string,
  description: string | null,
  readme: string | null
): string {
  const readmeSnippet = readme
    ? readme.slice(0, 6000).replace(/```[\s\S]*?```/g, "")
    : "";
  return `请用中文简洁总结以下 GitHub 项目。要求：
1. 第一段：一句话说清楚这个项目"是干嘛的"、适合谁用。
2. 第二段：列出 3-5 个核心功能 / 亮点，用简短的分号分隔。
3. 第三段：如果 README 里有典型使用场景或技术栈，请补充 1-2 句说明。

不要超过 200 字，不要 markdown 格式，纯文本即可。

项目信息:
- 名称: ${owner}/${repo}
- 官方描述: ${description || "(无)"}
- README 摘要: ${readmeSnippet || "(无 README)"}`;
}

async function callOpenAI(
  cfg: ProviderConfig,
  prompt: string
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: "你是一位擅长总结开源项目的资深开发者，始终用简体中文回答。",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices[0]?.message?.content?.trim() || "";
}

async function callAnthropic(
  cfg: ProviderConfig,
  prompt: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 400,
      temperature: 0.3,
      system: "你是一位擅长总结开源项目的资深开发者，始终用简体中文回答。",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text?.trim() || "";
}

async function callGoogle(
  cfg: ProviderConfig,
  prompt: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 400,
      },
      systemInstruction: {
        parts: [{ text: "你是一位擅长总结开源项目的资深开发者，始终用简体中文回答。" }],
      },
    }),
  });
  if (!res.ok) throw new Error(`Google ${res.status}`);
  const data = await res.json();
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""
  );
}

async function callOpenRouter(
  cfg: ProviderConfig,
  prompt: string
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: "你是一位擅长总结开源项目的资深开发者，始终用简体中文回答。",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export function isAIEnabled(): boolean {
  return detectProvider().provider !== "none";
}

export async function askLLM(
  userPrompt: string,
  systemPrompt = "你是一位资深的中文技术分析师，擅长总结趋势，语言简洁专业。",
  maxTokens = 800,
  temperature = 0.3
): Promise<{ text: string | null; mode: "ai" | "fallback" }> {
  const cfg = detectProvider();
  if (cfg.provider === "none") return { text: null, mode: "fallback" };
  try {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];
    let text: string;
    switch (cfg.provider) {
      case "dashscope":
      case "openai":
      case "deepseek":
      case "agnes": {
        const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            temperature,
            max_tokens: maxTokens,
            messages,
          }),
        });
        if (!res.ok) throw new Error(`LLM ${res.status}`);
        const d = await res.json();
        text = d.choices?.[0]?.message?.content?.trim() || "";
        break;
      }
      case "anthropic": {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cfg.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: cfg.model,
            max_tokens: maxTokens,
            temperature,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic ${res.status}`);
        const d = await res.json();
        text = d.content?.[0]?.text?.trim() || "";
        break;
      }
      case "google": {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens },
            systemInstruction: { parts: [{ text: systemPrompt }] },
          }),
        });
        if (!res.ok) throw new Error(`Google ${res.status}`);
        const d = await res.json();
        text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        break;
      }
      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({ model: cfg.model, temperature, max_tokens: maxTokens, messages }),
        });
        if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
        const d = await res.json();
        text = d.choices?.[0]?.message?.content?.trim() || "";
        break;
      }
      default:
        return { text: null, mode: "fallback" };
    }
    return { text: text || null, mode: "ai" };
  } catch (e) {
    console.warn("[LLM] askLLM 失败:", e);
    return { text: null, mode: "fallback" };
  }
}

export async function summarizeRepo(
  owner: string,
  repo: string,
  description: string | null,
  readme: string | null,
  { force = false }: { force?: boolean } = {}
): Promise<{ summary: string | null; mode: "ai" | "fallback" }> {
  const cfg = detectProvider();

  if (cfg.provider === "none") {
    return { summary: null, mode: "fallback" };
  }

  const cacheKey = `llm_sum:${owner}/${repo}`;
  if (force) deleteCache(cacheKey);
  try {
    const summary = await withCache(cacheKey, 86400 * 7, async () => {
      const prompt = buildPrompt(owner, repo, description, readme);
      switch (cfg.provider) {
        case "dashscope":
        case "openai":
        case "deepseek":
        case "agnes":
          return callOpenAI(cfg, prompt);
        case "anthropic":
          return callAnthropic(cfg, prompt);
        case "google":
          return callGoogle(cfg, prompt);
        case "openrouter":
          return callOpenRouter(cfg, prompt);
        default:
          throw new Error("no provider");
      }
    });
    return { summary: summary || null, mode: "ai" };
  } catch (err) {
    console.warn("[LLM] 总结失败，降级:", err);
    deleteCache(cacheKey);
    return { summary: null, mode: "fallback" };
  }
}

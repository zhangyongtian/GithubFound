import { NextRequest } from "next/server";
import { applyReqSettings } from "@/lib/applyReqSettings";
import { detectProvider } from "@/lib/llm";
import type { ProviderKey } from "@/lib/settingsShared";

export const runtime = "nodejs";

type ProviderInput = ProviderKey;

type ProviderFn = (cfg: {
  baseUrl?: string;
  apiKey: string;
  model: string;
  testPrompt: string;
}) => Promise<{
  ok: boolean;
  statusCode: number;
  message?: string;
}>;

const TEST_PROMPT = "Hi! Please respond with exactly: OK";
const TEST_SYSTEM = "You are a concise assistant.";
const DEFAULT_TIMEOUT_MS = 12_000;

function describeError(e: unknown, baseUrl: string, providerLabel: string): string {
  if (e instanceof Error) {
    const code = (e as unknown as { code?: string }).code || "";
    const cause = (e.cause as unknown as { code?: string; message?: string } | undefined);
    const causeCode = cause?.code || "";
    const combinedCode = code || causeCode;
    const raw = `${e.name}: ${e.message}`;

    if (combinedCode === "ETIMEDOUT" || combinedCode === "ECONNRESET" || /timeout|timed out/i.test(raw)) {
      return [
        `网络超时（12 秒内未收到 ${providerLabel} 的响应）：`,
        `目标地址：${baseUrl}`,
        ``,
        `这大概率不是你的 Key 错了，而是当前部署的服务器（Vercel / 本机）和 ${providerLabel} 的连接不稳定。`,
        `排查建议：`,
        `  1. 换用 Base URL 中转（例如自建的兼容 OpenAI 代理）；`,
        `  2. 如果填的是千问/阿里云，请确认 API Key 的地域与 DashScope 控制台一致；`,
        `  3. 忽略这条测试结果——项目里其他 AI 功能（AI 总结/魔法棒/风向标）的真实调用超时更长，可能这一家实际上是通的。`,
      ].join("\n");
    }
    if (combinedCode === "ENOTFOUND" || /getaddrinfo|ENOTFOUND|DNS/i.test(raw)) {
      return [
        `DNS 解析失败（${providerLabel} 的域名解析不出来）：`,
        `目标地址：${baseUrl}`,
        ``,
        `不是 Key 错误！请检查 Base URL 拼写，或换用另一个可访问的 Base URL 中转。`,
      ].join("\n");
    }
    if (combinedCode === "ECONNREFUSED") {
      return [
        `连接被拒绝：${baseUrl}`,
        `不是 Key 错误！Base URL 的端口 / 协议可能不对，或目标服务器当前没开。`,
      ].join("\n");
    }
    if (/TLS|SSL|certificate|CERT_HAS_EXPIRED|ERR_TLS/i.test(raw) || combinedCode?.startsWith("ERR_TLS")) {
      return [
        `SSL / TLS 握手失败（${providerLabel}）：`,
        raw,
        ``,
        `不是 Key 错误！通常是：自签证书、Base URL 用 http 代替 https、或本机/部署环境系统 CA 根证书缺失。`,
      ].join("\n");
    }
    if (/Failed to fetch|fetch failed|TypeError/i.test(raw)) {
      return [
        `网络请求失败（不是 API Key 错误！）：`,
        raw,
        combinedCode ? `底层错误码：${combinedCode}` : "",
        `目标地址：${baseUrl}`,
        ``,
        `Vercel Serverless 有时对国内厂商（阿里云 DashScope、DeepSeek 国内节点）的网络偶发不稳。`,
        `这个测试失败 ≠ 你的 Key 错了。请去其他 AI 功能（AI 总结 / 魔法棒）实测一下，如果能用，直接忽略本测试。`,
      ].filter(Boolean).join("\n");
    }
    return raw + (combinedCode ? `（${combinedCode}）` : "");
  }
  return String(e);
}

async function runFetch(
  providerLabel: string,
  baseUrl: string,
  input: string,
  init: RequestInit,
): Promise<{ ok: boolean; statusCode: number; message?: string; body?: unknown }> {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(input, { ...init, signal: ctrl.signal });
    clearTimeout(tm);
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const d = (await res.json()) as { error?: { message?: string; code?: string } | string };
        if (d && typeof d === "object" && "error" in d) {
          const err = d.error;
          if (err && typeof err === "object" && "message" in err && err.message) {
            message = err.message;
            if ((err as { code?: string }).code) message += ` [${(err as { code?: string }).code}]`;
          } else if (typeof err === "string" && err) {
            message = err;
          }
        } else if (d && typeof d === "object" && "message" in d) {
          message = (d as { message?: string }).message || message;
        }
      } catch {
        // 忽略 body 解析失败
      }
      const statusCode = res.status;
      if (statusCode === 401 || statusCode === 403) {
        message = [
          `API Key 无效 / 无权限：HTTP ${statusCode}`,
          `官方返回：${message}`,
          ``,
          `排查：`,
          `  - 是不是复制多了空格？点 "👁 显示" 核对首尾有没有空格；`,
          `  - 在服务商控制台确认 Key 没被冻结 / 被删 / 未启用；`,
          `  - 如果是阿里云 DashScope，控制台里的 API-KEY 页面必须点「查看完整 Key」再复制。`,
        ].join("\n");
      } else if (statusCode === 429) {
        message = [
          `请求太频繁（HTTP 429 限流）`,
          `官方返回：${message}`,
          `（不是 Key 错，稍后再试，或换用更高 QPS 的 Key）`,
        ].join("\n");
      } else if (statusCode >= 400 && statusCode < 500) {
        message = [
          `调用参数 / 额度问题：HTTP ${statusCode}`,
          `官方返回：${message}`,
          `（如果是 Insufficient balance / Out of quota 就是没余额了，充值或换 Key）`,
        ].join("\n");
      }
      return { ok: false, statusCode, message };
    }
    return { ok: true, statusCode: res.status };
  } catch (e) {
    clearTimeout(tm);
    return { ok: false, statusCode: 0, message: describeError(e, baseUrl, providerLabel) };
  }
}

const runOpenAICompat: ProviderFn = async (cfg) => {
  const baseUrl = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const r = await runFetch("OpenAI 兼容", baseUrl, `${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      max_tokens: 1,
      messages: [
        { role: "system", content: TEST_SYSTEM },
        { role: "user", content: cfg.testPrompt },
      ],
    }),
  });
  return r;
};

export async function POST(req: NextRequest) {
  applyReqSettings(req);
  let body: { provider?: ProviderInput } = {};
  try {
    body = (await req.json()) as { provider?: ProviderInput };
  } catch {
    body = {};
  }
  const forced =
    body.provider === "agnes" ||
    body.provider === "dashscope" ||
    body.provider === "deepseek" ||
    body.provider === "openai" ||
    body.provider === "anthropic" ||
    body.provider === "google" ||
    body.provider === "openrouter"
      ? body.provider
      : null;

  const cfg = detectProvider(forced);

  if (cfg.provider === "none") {
    return Response.json({
      ok: false,
      provider: "none",
      message: "这一家未配置 API Key，或者选择模式里手动指定了另一家，请展开对应卡片先填好 Key，再点单独测试。",
    });
  }

  try {
    let r: { ok: boolean; statusCode: number; message?: string } = {
      ok: false,
      statusCode: 0,
      message: "未知 provider",
    };

    switch (cfg.provider) {
      case "dashscope":
      case "openai":
      case "deepseek":
      case "agnes":
        r = await runOpenAICompat({
          baseUrl: cfg.baseUrl,
          apiKey: cfg.apiKey,
          model: cfg.model,
          testPrompt: TEST_PROMPT,
        });
        break;
      case "anthropic": {
        const baseUrl = "https://api.anthropic.com";
        r = await runFetch("Claude", baseUrl, `${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": cfg.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: cfg.model,
            max_tokens: 1,
            temperature: 0,
            system: TEST_SYSTEM,
            messages: [{ role: "user", content: TEST_PROMPT }],
          }),
        });
        break;
      }
      case "google": {
        const baseUrl = "https://generativelanguage.googleapis.com";
        const url = `${baseUrl}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
        r = await runFetch("Gemini", baseUrl, url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: TEST_PROMPT }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 1 },
          }),
        });
        break;
      }
      case "openrouter": {
        const baseUrl = "https://openrouter.ai";
        r = await runFetch("OpenRouter", baseUrl, `${baseUrl}/api/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            temperature: 0,
            max_tokens: 1,
            messages: [
              { role: "system", content: TEST_SYSTEM },
              { role: "user", content: TEST_PROMPT },
            ],
          }),
        });
        break;
      }
    }
    return Response.json({
      ok: r.ok,
      provider: cfg.provider,
      model: cfg.model,
      statusCode: r.statusCode,
      message: r.ok ? `连接成功，模型「${cfg.model}」可正常调用 ✅` : r.message || "连接失败",
    });
  } catch (e) {
    return Response.json({
      ok: false,
      provider: cfg.provider,
      message: describeError(e, (cfg as { baseUrl?: string }).baseUrl || cfg.provider, String(cfg.provider)),
    });
  }
}

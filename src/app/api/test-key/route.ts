import { NextRequest } from "next/server";
import { applyReqSettings } from "@/lib/applyReqSettings";
import { detectProvider } from "@/lib/llm";
import type { ProviderKey } from "@/lib/settingsShared";

export const runtime = "nodejs";

type ProviderInput = ProviderKey;

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
      message: "当前没有可用的模型，或者指定的这一家未配置 API Key。",
    });
  }

  try {
    let ok = false;
    let message = "";
    let statusCode = 0;
    const testPrompt = "Hi! Please respond with exactly: OK";
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
            temperature: 0,
            max_tokens: 1,
            messages: [
              { role: "system", content: "You are a concise assistant." },
              { role: "user", content: testPrompt },
            ],
          }),
        });
        statusCode = res.status;
        ok = res.ok;
        if (!ok) {
          try {
            const d = (await res.json()) as { error?: { message?: string; code?: string } };
            message = d.error?.message || `HTTP ${res.status}`;
          } catch {
            message = `HTTP ${res.status}`;
          }
        }
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
            max_tokens: 1,
            temperature: 0,
            system: "You are a concise assistant.",
            messages: [{ role: "user", content: testPrompt }],
          }),
        });
        statusCode = res.status;
        ok = res.ok;
        if (!ok) {
          try {
            const d = (await res.json()) as { error?: { message?: string } };
            message = d.error?.message || `HTTP ${res.status}`;
          } catch {
            message = `HTTP ${res.status}`;
          }
        }
        break;
      }
      case "google": {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: testPrompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 1 },
          }),
        });
        statusCode = res.status;
        ok = res.ok;
        if (!ok) {
          try {
            const d = (await res.json()) as { error?: { message?: string } };
            message = d.error?.message || `HTTP ${res.status}`;
          } catch {
            message = `HTTP ${res.status}`;
          }
        }
        break;
      }
      case "openrouter": {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
              { role: "system", content: "You are a concise assistant." },
              { role: "user", content: testPrompt },
            ],
          }),
        });
        statusCode = res.status;
        ok = res.ok;
        if (!ok) {
          try {
            const d = (await res.json()) as { error?: { message?: string } };
            message = d.error?.message || `HTTP ${res.status}`;
          } catch {
            message = `HTTP ${res.status}`;
          }
        }
        break;
      }
      default:
        ok = false;
        message = "未知的 Provider";
    }
    return Response.json({
      ok,
      provider: cfg.provider,
      model: cfg.model,
      statusCode,
      message: ok ? `连接成功，模型「${cfg.model}」可正常调用 ✅` : message,
    });
  } catch (e) {
    return Response.json({
      ok: false,
      provider: cfg.provider,
      message: e instanceof Error ? e.message : "请求失败",
    });
  }
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SETTINGS_FIELDS,
  PROVIDER_OPTIONS,
  loadSettings,
  saveSettings,
  clearSettings,
  encodeSettingsHeader,
  type SettingsMap,
  type SettingsKey,
  type ProviderKey,
} from "@/lib/clientSettings";

type ToastState = {
  type: "success" | "error" | "info";
  message: string;
} | null;

type DetectResp = {
  enabled: boolean;
  configured: boolean;
  agnesFallback?: boolean;
  provider?: string;
  model?: string;
  displayName?: string;
  selected?: string;
  error?: string;
  usedFrom: "localStorage" | "server_env" | "server_env_fallback" | "none";
  effectiveKeys: string[];
};

type TestResult = {
  ok: boolean;
  provider?: string;
  model?: string;
  statusCode?: number;
  message?: string;
};

const AGNES_DEFAULTS = {
  AGNES_API_KEY: "sk-Qfal9xUmJOVLppj64WEbaq9oD4rachChk8li7R44YdPpMIF6",
  AGNES_MODEL: "agnes-2.0-flash",
  AGNES_BASE_URL: "https://apihub.agnes-ai.com/v1",
} as const satisfies SettingsMap;

const NON_LLM_KEYS: readonly SettingsKey[] = ["GITHUB_TOKEN", "SELECTED_PROVIDER"] as const;
const SELECTED_KEY: SettingsKey = "SELECTED_PROVIDER";

function isProviderKey(s: string | undefined): s is ProviderKey {
  return (
    s === "auto" ||
    s === "agnes" ||
    s === "dashscope" ||
    s === "deepseek" ||
    s === "openai" ||
    s === "anthropic" ||
    s === "google" ||
    s === "openrouter"
  );
}

const PROVIDER_DEFAULTS: Record<string, Partial<Record<SettingsKey, string>>> = {
  agnes: {
    AGNES_API_KEY: AGNES_DEFAULTS.AGNES_API_KEY,
    AGNES_MODEL: AGNES_DEFAULTS.AGNES_MODEL,
    AGNES_BASE_URL: AGNES_DEFAULTS.AGNES_BASE_URL,
  },
  dashscope: {
    DASHSCOPE_MODEL: "qwen-plus",
    DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  deepseek: {
    DEEPSEEK_MODEL: "deepseek-chat",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1",
  },
  openai: {
    OPENAI_MODEL: "gpt-4o-mini",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
  },
  anthropic: {
    ANTHROPIC_MODEL: "claude-3-5-haiku-latest",
  },
  google: {
    GOOGLE_MODEL: "gemini-2.0-flash",
  },
  openrouter: {
    OPENROUTER_MODEL: "openai/gpt-4o-mini",
  },
};

export default function SettingsForm() {
  const [values, setValues] = useState<SettingsMap>({});
  const [revealed, setRevealed] = useState<Partial<Record<SettingsKey, boolean>>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [testing, setTesting] = useState<string | false>(false);
  const [detect, setDetect] = useState<DetectResp | null>(null);
  const [perProviderTest, setPerProviderTest] = useState<Record<string, TestResult | null>>({});
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { github: false, agnes: true };
    for (const s of SETTINGS_FIELDS) {
      if (!(s.provider in initial)) initial[s.provider] = false;
    }
    return initial;
  });

  const selectedProvider: ProviderKey = useMemo(() => {
    const raw = values[SELECTED_KEY];
    return isProviderKey(raw) ? raw : "auto";
  }, [values]);

  const initFromStorage = useCallback(() => {
    const saved = loadSettings();
    const hasAnyLLM = Object.entries(saved).some(
      ([k, v]) => !NON_LLM_KEYS.includes(k as SettingsKey) && typeof v === "string" && v.trim().length > 0,
    );
    const next: SettingsMap = { ...saved };
    if (!next[SELECTED_KEY] || !isProviderKey(next[SELECTED_KEY])) {
      next[SELECTED_KEY] = "auto";
    }
    if (!hasAnyLLM) {
      for (const [k, v] of Object.entries(AGNES_DEFAULTS) as Array<[SettingsKey, string]>) {
        if (!next[k]) next[k] = v;
      }
    }
    setValues(next);
  }, []);

  useEffect(() => {
    initFromStorage();
  }, [initFromStorage]);

  const handleChange = (key: SettingsKey, raw: string) => {
    setValues((prev) => ({ ...prev, [key]: raw }));
    setDetect(null);
    const section = SETTINGS_FIELDS.find((s) => s.fields.some((f) => f.key === key));
    if (section && perProviderTest[section.provider]) {
      setPerProviderTest((prev) => ({ ...prev, [section.provider]: null }));
    }
  };

  const showToast = (t: ToastState) => {
    setToast(t);
    if (t) {
      const id = setTimeout(() => setToast(null), 3200);
      return () => clearTimeout(id);
    }
  };

  const applyClient = useCallback(async (map: SettingsMap): Promise<DetectResp | null> => {
    try {
      const enc = encodeSettingsHeader(map);
      const hdrs: Record<string, string> = { "cache-control": "no-store" };
      if (enc) hdrs["x-gf-settings"] = enc;
      const res = await fetch("/api/ai-status", { headers: hdrs });
      if (!res.ok) return null;
      return (await res.json()) as DetectResp;
    } catch {
      return null;
    }
  }, []);

  const testSingleProvider = useCallback(
    async (providerSection: string, forced: ProviderKey | null): Promise<TestResult> => {
      try {
        const enc = encodeSettingsHeader(values);
        const hdrs: Record<string, string> = {
          "Content-Type": "application/json",
          "cache-control": "no-store",
        };
        if (enc) hdrs["x-gf-settings"] = enc;
        const res = await fetch("/api/test-key", {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({ provider: forced }),
        });
        if (!res.ok) {
          return { ok: false, provider: providerSection, message: `后端 HTTP ${res.status}` };
        }
        return (await res.json()) as TestResult;
      } catch (e) {
        return { ok: false, provider: providerSection, message: e instanceof Error ? e.message : "请求失败" };
      }
    },
    [values],
  );

  const onTestOne = async (providerSection: string, forced: ProviderKey | null) => {
    setTesting(providerSection);
    const r = await testSingleProvider(providerSection, forced);
    setPerProviderTest((prev) => ({ ...prev, [providerSection]: r }));
    setTesting(false);
    showToast({
      type: r.ok ? "success" : "error",
      message: r.ok
        ? `${providerSection} 测试通过：${r.model || ""}`
        : `${providerSection} 失败：${r.message || "请检查 API Key / Model / Base URL"}`,
    });
  };

  const onTestAll = async () => {
    setTesting("__all__");
    const d = await applyClient(values);
    setDetect(d);
    setTesting(false);
    if (d?.enabled) {
      const dpy = d.displayName || "AI";
      const note = d.agnesFallback ? "（当前为 Agnes 兜底免费模式，建议配置自己的 Key）" : "";
      showToast({ type: "success", message: `检测通过：${dpy} · ${d.provider || "?"}${d.model ? " / " + d.model.split("/").pop() : ""} ${note}` });
    } else if (d?.configured === false) {
      showToast({
        type: "info",
        message: "你还没配置任何 API Key，当前使用 Agnes 免费兜底模型（可直接用）",
      });
    } else {
      showToast({
        type: "error",
        message: "当前没有可用的 LLM：你填了 Key 但是没通过检测，检查 Key 是否填对，或展开对应卡片点单独测试按钮。",
      });
    }
  };

  const onSave = async () => {
    saveSettings(values);
    const d = await applyClient(values);
    setDetect(d);
    showToast({
      type: "success",
      message: d?.configured
        ? d?.enabled
          ? `已保存并通过验证：${d.displayName || "AI"} ✅`
          : "已保存到当前浏览器（检测未通过，建议点下面单测按钮定位问题）🔐"
        : d?.enabled
          ? "已保存（当前使用 Agnes 兜底免费模式，可直接用，或填自己的 Key 获得更好效果）"
          : "已保存到当前浏览器 🔐",
    });
  };

  const onReset = () => {
    clearSettings();
    const agnesSection = SETTINGS_FIELDS.find((s) => s.provider === "agnes");
    const defaults: SettingsMap = { [SELECTED_KEY]: "auto" };
    if (agnesSection) {
      for (const f of agnesSection.fields) {
        defaults[f.key] = (PROVIDER_DEFAULTS.agnes?.[f.key]) || "";
      }
    }
    setValues(defaults);
    setDetect(null);
    setPerProviderTest({});
    showToast({ type: "info", message: "已从本地浏览器清除所有配置，已自动恢复 Agnes 默认免费版 🆓" });
  };

  const setSelectedProvider = (next: ProviderKey) => {
    setValues((prev) => ({ ...prev, [SELECTED_KEY]: next }));
    setDetect(null);
  };

  const fillDefaults = (provider: string) => {
    const patch: SettingsMap = {};
    const d = PROVIDER_DEFAULTS[provider];
    const section = SETTINGS_FIELDS.find((s) => s.provider === provider);
    if (!section) return;
    for (const f of section.fields) {
      if (typeof values[f.key] === "string" && values[f.key]!.trim().length > 0) continue;
      if (d && typeof d[f.key] === "string") {
        patch[f.key] = d[f.key] as string;
      } else if (f.placeholder) {
        if (f.key.includes("MODEL") || f.key.includes("BASE_URL")) {
          patch[f.key] = f.placeholder;
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      setValues((prev) => ({ ...prev, ...patch }));
      showToast({ type: "info", message: "已填入默认模型名 / Base URL（别忘了填 API Key！🔑）" });
    } else {
      showToast({ type: "info", message: "已经有默认值了，先清空再试～" });
    }
    setDetect(null);
    if (perProviderTest[provider]) setPerProviderTest((prev) => ({ ...prev, [provider]: null }));
  };

  const totals = useMemo(() => {
    const keys = Object.keys(values).filter(
      (k) => typeof values[k as SettingsKey] === "string" && (values[k as SettingsKey] as string).trim().length > 0,
    );
    const providers = new Set<string>();
    for (const s of SETTINGS_FIELDS) {
      for (const f of s.fields) {
        if (keys.includes(f.key)) providers.add(s.provider);
      }
    }
    return { filled: keys.length, providers: Array.from(providers) };
  }, [values]);

  const providerLabel = (p: string) => {
    switch (p) {
      case "github": return "GitHub";
      case "agnes": return "Agnes 聚合";
      case "dashscope": return "千问 DashScope";
      case "deepseek": return "DeepSeek";
      case "openai": return "OpenAI GPT";
      case "anthropic": return "Claude";
      case "google": return "Gemini";
      case "openrouter": return "OpenRouter";
      default: return p;
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div
          role="status"
          className={`fixed right-4 top-4 z-50 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-xl ring-1 backdrop-blur ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-500/20"
              : toast.type === "error"
                ? "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-500/20"
                : "bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-500/20"
          }`}
        >
          {toast.type === "success" ? "✅" : toast.type === "error" ? "⚠️" : "ℹ️"}
          {toast.message}
        </div>
      )}

      <section className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 p-5 shadow-sm dark:border-amber-500/30 dark:from-amber-500/10 dark:via-yellow-500/5 dark:to-orange-500/10">
        <div className="flex flex-wrap items-start gap-3">
          <div className="text-2xl">🔐</div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold tracking-tight text-amber-900 dark:text-amber-200">
              所有配置仅保存在当前浏览器本地（localStorage）
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-amber-800/90 dark:text-amber-200/85">
              你的 API Key / Token <b>不会</b>上传到任何服务器数据库，不会持久化存于本站后端。
              调用 GitHub / LLM 官方接口时，会临时随请求携带给当前页面的后端进程代为转发，<b>用完即丢弃</b>。
              换一台设备 / 换一个浏览器 / 清浏览器缓存都会让配置失效，这是安全的做法。
            </p>
            <ul className="mt-2 grid gap-1 text-xs text-amber-800/85 dark:text-amber-200/80 sm:grid-cols-2">
              <li>· 优先级：🆓 Agnes（默认免费） &gt; 千问 DashScope &gt; DeepSeek &gt; OpenAI GPT &gt; Claude &gt; Gemini &gt; OpenRouter</li>
              <li>· 每一家展开后都有「单独测试这家」按钮，测不过就点那一家的按钮看错误原因</li>
              <li>· 不填任何 Key 也能用（Agnes 兜底免费模式，稳定性可能略差）</li>
              <li>· GitHub Token 不填默认 60 次 / 小时，填了 5000 次 / 小时</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">
              ⚙️ API 配置操作
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              目前已填 <b>{totals.filled - (values[SELECTED_KEY] ? 1 : 0)}</b> 项 · 涉及{" "}
              {totals.providers.length > 0
                ? totals.providers.map(providerLabel).join(" / ")
                : "尚未配置"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onTestAll}
              disabled={testing !== false}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {testing !== false ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              ) : (
                "🛰"
              )}
              {testing !== false ? "检测中..." : "🔍 检测可用模型"}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              🗑 清空本机配置
            </button>
            <button
              type="button"
              onClick={onSave}
              className="inline-flex h-9 items-center gap-1 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-4 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:brightness-110"
            >
              💾 保存到浏览器本地
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/60 p-4 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-zinc-900/40 dark:to-violet-500/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-indigo-900 dark:text-indigo-200">
              <span>🎛️</span> 选择生效的模型服务商
            </h3>
            <p className="mt-1 text-[12px] text-indigo-700/80 dark:text-indigo-300/80">
              多个 Key 同时填的时候，这里决定「实际调哪一家」。不想操心就选 <b>自动</b>，按优先级挑第一个能用的。
            </p>
          </div>
          <div className="flex h-8 items-center gap-1.5 rounded-full bg-white/80 px-3 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200 dark:bg-zinc-900/60 dark:text-indigo-300 dark:ring-indigo-500/30">
            {selectedProvider === "auto"
              ? "🤖 当前：自动模式"
              : `✨ 当前生效：${PROVIDER_OPTIONS.find((p) => p.key === selectedProvider)?.label ?? selectedProvider}`}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {PROVIDER_OPTIONS.map((opt) => {
            const active = selectedProvider === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelectedProvider(opt.key)}
                className={`group flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-all ${
                  active
                    ? "border-indigo-300 bg-white shadow-sm ring-2 ring-indigo-500/40 dark:border-indigo-500/40 dark:bg-zinc-900 dark:ring-indigo-400/40"
                    : "border-zinc-200 bg-white/60 hover:border-indigo-200 hover:bg-white dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:hover:border-indigo-500/30 dark:hover:bg-zinc-900/60"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-lg leading-none">{opt.emoji}</span>
                  {active && (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                      ✓
                    </span>
                  )}
                </div>
                <div className={`mt-1.5 text-xs font-extrabold ${active ? "text-indigo-900 dark:text-indigo-100" : "text-zinc-800 dark:text-zinc-200"}`}>
                  {opt.label}
                </div>
                <div className={`mt-0.5 line-clamp-2 text-[10.5px] leading-snug ${active ? "text-indigo-700/80 dark:text-indigo-200/85" : "text-zinc-500 dark:text-zinc-400"}`}>
                  {opt.help}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {detect && (
        <section
          className={`rounded-2xl border p-4 ${
            detect.enabled
              ? detect.agnesFallback
                ? "border-sky-200 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-500/5"
                : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/5"
              : "border-zinc-200 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-800/40"
          }`}
        >
          <div className="flex flex-wrap items-start gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ${
                detect.enabled
                  ? detect.agnesFallback
                    ? "bg-gradient-to-br from-sky-500 to-cyan-500"
                    : "bg-gradient-to-br from-emerald-500 to-teal-500"
                  : "bg-zinc-400"
              }`}
            >
              {detect.enabled ? "✓" : "✕"}
            </div>
            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-sm font-bold ${
                    detect.enabled
                      ? detect.agnesFallback
                        ? "text-sky-800 dark:text-sky-200"
                        : "text-emerald-800 dark:text-emerald-200"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {detect.enabled
                    ? detect.agnesFallback
                      ? "当前使用：Agnes 兜底免费模式（可直接用，建议配置自己的 Key 更稳）"
                      : "可用的 LLM：" + (detect.displayName || "AI")
                    : "当前无可启用的 LLM"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${
                    detect.selected === "auto"
                      ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30"
                      : "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30"
                  }`}
                >
                  选择方式：
                  {detect.selected === "auto"
                    ? "自动优先级"
                    : `手动指定 ${PROVIDER_OPTIONS.find((p) => p.key === detect.selected)?.label ?? detect.selected}`}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${
                    detect.usedFrom === "localStorage"
                      ? "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30"
                      : detect.usedFrom === "server_env"
                        ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30"
                        : detect.usedFrom === "server_env_fallback"
                          ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
                          : "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700"
                  }`}
                >
                  来源：
                  {detect.usedFrom === "localStorage"
                    ? "本机浏览器（你的配置）"
                    : detect.usedFrom === "server_env"
                      ? "服务器 .env.local"
                      : detect.usedFrom === "server_env_fallback"
                        ? "Agnes 兜底免费 Key"
                        : "未配置"}
                </span>
              </div>
              {detect.enabled && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Provider：<b>{detect.provider || "-"}</b> · 模型：<b>{detect.model || "-"}</b>
                </p>
              )}
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                你自己填的 LLM 字段（不含 Agnes 兜底）：
                <code className="ml-1 rounded bg-white/60 px-1 py-0.5 text-[11px] text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-300 dark:ring-zinc-700">
                  {detect.effectiveKeys.length > 0 ? detect.effectiveKeys.join(", ") : "（无，用的 Agnes 兜底免费）"}
                </code>
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-3">
        {SETTINGS_FIELDS.map((section) => {
          const open = sectionOpen[section.provider];
          const filled = section.fields.filter(
            (f) => typeof values[f.key] === "string" && (values[f.key] as string).trim().length > 0,
          ).length;
          const testResult = perProviderTest[section.provider] || null;
          const isLLM = section.provider !== "github";
          const sectionProviderKey = section.provider === "github"
            ? null
            : section.provider as ProviderKey;
          const nowTestingThis = testing === section.provider;
          return (
            <section
              key={section.provider}
              className={`rounded-2xl border transition-colors ${
                open
                  ? "border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/40"
                  : "border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900/10"
              }`}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() =>
                  setSectionOpen((prev) => ({ ...prev, [section.provider]: !prev[section.provider] }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSectionOpen((prev) => ({ ...prev, [section.provider]: !prev[section.provider] }));
                  }
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-t-2xl px-3.5 py-2.5 text-left sm:px-4 sm:py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {section.section}
                    </h3>
                    {filled > 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                        {filled} / {section.fields.length} 已填
                      </span>
                    )}
                    {testResult && section.provider !== "github" && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${
                          testResult.ok
                            ? "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
                            : "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
                        }`}
                      >
                        {testResult.ok ? "✅ 通过" : "❌ 失败，展开"}
                      </span>
                    )}
                  </div>
                  {section.hint && (
                    <p className="mt-0.5 line-clamp-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">
                      {section.hint}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fillDefaults(section.provider);
                      if (!sectionOpen[section.provider]) {
                        setSectionOpen((prev) => ({ ...prev, [section.provider]: true }));
                      }
                    }}
                    className="hidden h-7 items-center rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 md:inline-flex"
                  >
                    📋 填默认值
                  </button>
                  {isLLM && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!sectionOpen[section.provider]) {
                          setSectionOpen((prev) => ({ ...prev, [section.provider]: true }));
                        }
                        await onTestOne(section.provider, sectionProviderKey);
                      }}
                      disabled={nowTestingThis}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-indigo-200 bg-white px-1.5 text-[10.5px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50 sm:px-2 sm:text-[11px] dark:border-indigo-500/30 dark:bg-zinc-900 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                    >
                      {nowTestingThis && (
                        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                      )}
                      <span className="sm:hidden">🧪测</span>
                      <span className="hidden sm:inline">🧪 单独测这一家</span>
                    </button>
                  )}
                  <span
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition-transform dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 ${
                      open ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </div>
              </div>

              {open && (
                <div className="grid gap-3 border-t border-zinc-200/70 px-4 py-4 sm:grid-cols-2 dark:border-zinc-700/60">
                  {section.fields.map((f) => {
                    const raw = values[f.key] || "";
                    const type = revealed[f.key] ? "text" : f.type || "text";
                    const masked = f.type === "password" && !revealed[f.key];
                    return (
                      <div key={f.key} className="sm:col-span-2">
                        <label className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          <span>{f.label}</span>
                          {masked && (
                            <button
                              type="button"
                              onClick={() =>
                                setRevealed((prev) => ({ ...prev, [f.key]: !prev[f.key] }))
                              }
                              className="rounded-full px-2 py-0.5 text-[10.5px] font-medium text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            >
                              {revealed[f.key] ? "🙈 隐藏" : "👁 显示"}
                            </button>
                          )}
                        </label>
                        <div className="mt-1 relative">
                          <input
                            type={type}
                            value={raw}
                            onChange={(e) => handleChange(f.key, e.target.value)}
                            placeholder={f.placeholder || ""}
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                            className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-3 pr-16 text-sm text-zinc-900 outline-none ring-0 transition-colors focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100 dark:focus:border-indigo-500/50 dark:focus:ring-indigo-500/10"
                          />
                          {masked && raw.length > 0 && (
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              {raw.length} 字符
                            </span>
                          )}
                        </div>
                        {f.help && (
                          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                            {f.help}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {isLLM && testResult && (
                    <div
                      className={`sm:col-span-2 rounded-xl border px-3 py-2.5 text-xs ${
                        testResult.ok
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-200"
                          : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/5 dark:text-rose-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5">{testResult.ok ? "✅" : "⚠️"}</span>
                        <div className="flex-1 space-y-1">
                          <div className="font-bold">
                            {testResult.ok
                              ? `${providerLabel(testResult.provider || section.provider)} 连接成功`
                              : `${providerLabel(testResult.provider || section.provider)} 连接失败`}
                            {testResult.statusCode && (
                              <span className="ml-2 rounded-full bg-white/60 px-2 py-0.5 font-mono text-[10.5px] ring-1 ring-current/20">
                                HTTP {testResult.statusCode}
                              </span>
                            )}
                            {testResult.model && (
                              <span className="ml-2 rounded-full bg-white/60 px-2 py-0.5 font-mono text-[10.5px] ring-1 ring-current/20">
                                {testResult.model}
                              </span>
                            )}
                          </div>
                          {testResult.message && <div className="whitespace-pre-wrap">{testResult.message}</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">
              ⬇️ 底部操作（和顶部一致）
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              改完配置直接点下面按钮保存，不用滚回最上面
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onTestAll}
              disabled={testing !== false}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {testing !== false ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              ) : (
                "🛰"
              )}
              {testing !== false ? "检测中..." : "🔍 检测可用模型"}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              🗑 清空本机配置
            </button>
            <button
              type="button"
              onClick={onSave}
              className="inline-flex h-9 items-center gap-1 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-4 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:brightness-110"
            >
              💾 保存到浏览器本地
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

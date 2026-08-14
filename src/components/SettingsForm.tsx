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
  provider?: string;
  model?: string;
  displayName?: string;
  selected?: string;
  error?: string;
  usedFrom: "localStorage" | "server_env" | "none";
  effectiveKeys: string[];
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

export default function SettingsForm() {
  const [values, setValues] = useState<SettingsMap>({});
  const [revealed, setRevealed] = useState<Partial<Record<SettingsKey, boolean>>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [testing, setTesting] = useState(false);
  const [detect, setDetect] = useState<DetectResp | null>(null);
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { github: true, agnes: true };
    for (const s of SETTINGS_FIELDS) initial[s.provider] = s.provider === "github" || s.provider === "agnes";
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
  };

  const showToast = (t: ToastState) => {
    setToast(t);
    if (t) {
      const id = setTimeout(() => setToast(null), 2500);
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
      const data = (await res.json()) as DetectResp;
      const allKeys = Object.keys(map).filter(
        (k) => typeof map[k as SettingsKey] === "string" && (map[k as SettingsKey] as string).trim().length > 0,
      );
      const usedFrom: DetectResp["usedFrom"] = data?.enabled
        ? allKeys.length > 0
          ? "localStorage"
          : "server_env"
        : "none";
      return {
        enabled: !!data?.enabled,
        provider: data?.provider,
        model: data?.model,
        displayName: data?.displayName,
        usedFrom,
        effectiveKeys: allKeys,
      };
    } catch {
      return null;
    }
  }, []);

  const onSave = async () => {
    saveSettings(values);
    const d = await applyClient(values);
    setDetect(d);
    showToast({ type: "success", message: d?.enabled ? `已保存并检测到 ${d.displayName || "AI"} 可用 ✅` : "已保存到当前浏览器 🔐" });
  };

  const onReset = () => {
    clearSettings();
    const agnesSection = SETTINGS_FIELDS.find((s) => s.provider === "agnes");
    const defaults: SettingsMap = { [SELECTED_KEY]: "auto" };
    if (agnesSection) {
      const presets: Record<string, string> = {
        AGNES_API_KEY: AGNES_DEFAULTS.AGNES_API_KEY,
        AGNES_MODEL: AGNES_DEFAULTS.AGNES_MODEL,
        AGNES_BASE_URL: AGNES_DEFAULTS.AGNES_BASE_URL,
      };
      for (const f of agnesSection.fields) defaults[f.key] = presets[f.key] || "";
    }
    setValues(defaults);
    setDetect(null);
    showToast({ type: "info", message: "已从本地浏览器清除所有配置，已自动恢复 Agnes 默认免费版 🆓" });
  };

  const setSelectedProvider = (next: ProviderKey) => {
    setValues((prev) => ({ ...prev, [SELECTED_KEY]: next }));
    setDetect(null);
  };

  const onTest = async () => {
    setTesting(true);
    const d = await applyClient(values);
    setDetect(d);
    setTesting(false);
    if (d?.enabled) {
      showToast({
        type: "success",
        message: `检测通过：${d.displayName || "AI"} · ${d.provider || "?"}${d.model ? ` / ${d.model.split("/").pop()}` : ""}`,
      });
    } else {
      showToast({
        type: "error",
        message: "当前未检测到可用的 LLM 配置（检查 Key 是否填对，或配置优先级 Agnes > 千问 > DeepSeek > GPT > Claude > Gemini > OpenRouter）",
      });
    }
  };

  const fillDemo = (provider: string) => {
    const patch: SettingsMap = {};
    for (const s of SETTINGS_FIELDS) {
      if (s.provider !== provider) continue;
      for (const f of s.fields) {
        if (!(f.key in values) || !String(values[f.key] || "").trim()) {
          const sectionPresets: Record<string, Record<string, string>> = {
            agnes: {
              AGNES_API_KEY: AGNES_DEFAULTS.AGNES_API_KEY,
              AGNES_MODEL: AGNES_DEFAULTS.AGNES_MODEL,
              AGNES_BASE_URL: AGNES_DEFAULTS.AGNES_BASE_URL,
            },
          };
          const section = sectionPresets[provider];
          if (section && typeof section[f.key] === "string") {
            patch[f.key] = section[f.key];
            continue;
          }
          if (f.placeholder) {
            if (f.key.includes("MODEL") || f.key.includes("BASE_URL")) {
              patch[f.key] = f.placeholder;
            }
          }
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      setValues((prev) => ({ ...prev, ...patch }));
      setDetect(null);
    }
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

  return (
    <div className="space-y-6">
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
              <li>· 优先级：🆓 Agnes（默认免费） &gt; 千问 DashScope &gt; DeepSeek &gt; OpenAI GPT &gt; Anthropic Claude &gt; Google Gemini &gt; OpenRouter</li>
              <li>· <b>任一</b> Key 填对即可启用 AI 总结 / 魔法棒搜索 / 风向标 AI</li>
              <li>· 不填任何 Key 也能用（AI 功能降级为 README 摘录摘要）</li>
              <li>· GitHub Token 不填默认 60 次 / 小时，填了 5000 次 / 小时</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100">
              ⚙️ API 配置
            </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                目前已填 <b>{totals.filled - (values[SELECTED_KEY] ? 1 : 0)}</b> 项 · 涉及{" "}
                {totals.providers.length > 0 ? (
                  totals.providers
                    .map((p) =>
                      p === "github" ? "GitHub" :
                      p === "agnes" ? "Agnes 聚合" :
                      p === "dashscope" ? "千问 DashScope" :
                      p === "deepseek" ? "DeepSeek" :
                      p === "openai" ? "OpenAI" :
                      p === "anthropic" ? "Anthropic Claude" :
                      p === "google" ? "Google Gemini" : "OpenRouter",
                    )
                    .join(" / ")
                ) : (
                  "尚未配置"
                )}
              </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onTest}
              disabled={testing}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {testing ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              ) : (
                "🛰"
              )}
              {testing ? "检测中..." : "检测可用模型"}
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-500/30 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
            >
              🗑 清空本机
            </button>
            <button
              type="button"
              onClick={onSave}
              className="inline-flex h-9 items-center gap-1 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-4 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:brightness-110"
            >
              💾 保存配置
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-violet-50/60 p-4 dark:border-indigo-500/20 dark:from-indigo-500/10 dark:via-zinc-900/40 dark:to-violet-500/10">
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
              {selectedProvider === "auto" ? "🤖 当前：自动模式" : `✨ 当前生效：${PROVIDER_OPTIONS.find(p => p.key === selectedProvider)?.label ?? selectedProvider}`}
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
                    {active && <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">✓</span>}
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
        </div>

        {detect && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              detect.enabled
                ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-500/5"
                : "border-zinc-200 bg-zinc-50/70 dark:border-zinc-700 dark:bg-zinc-800/40"
            }`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm ${detect.enabled ? "bg-gradient-to-br from-emerald-500 to-teal-500" : "bg-zinc-400"}`}>
                {detect.enabled ? "✓" : "✕"}
              </div>
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-bold ${detect.enabled ? "text-emerald-800 dark:text-emerald-200" : "text-zinc-700 dark:text-zinc-300"}`}>
                    {detect.enabled ? "可用的 LLM：" + (detect.displayName || "AI") : "当前无可启用的 LLM"}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${detect.selected === "auto" ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30" : "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30"}`}>
                    选择方式：{detect.selected === "auto" ? "自动优先级" : `手动指定 ${PROVIDER_OPTIONS.find(p => p.key === detect.selected)?.label ?? detect.selected}`}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${detect.usedFrom === "localStorage" ? "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30" : detect.usedFrom === "server_env" ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30" : "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700"}`}>
                    来源：
                    {detect.usedFrom === "localStorage" ? "本机浏览器（你的配置）" : detect.usedFrom === "server_env" ? "服务器 .env.local" : "未配置"}
                  </span>
                </div>
                {detect.enabled && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Provider：<b>{detect.provider || "-"}</b> · 模型：<b>{detect.model || "-"}</b>
                  </p>
                )}
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  已识别本机字段：
                  <code className="ml-1 rounded bg-white/60 px-1 py-0.5 text-[11px] text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-300 dark:ring-zinc-700">
                    {detect.effectiveKeys.length > 0 ? detect.effectiveKeys.join(", ") : "（无）"}
                  </code>
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {SETTINGS_FIELDS.map((section) => {
            const open = sectionOpen[section.provider];
            const filled = section.fields.filter(
              (f) => typeof values[f.key] === "string" && (values[f.key] as string).trim().length > 0,
            ).length;
            return (
              <div
                key={section.provider}
                className={`rounded-2xl border transition-colors ${
                  open
                    ? "border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-900/40"
                    : "border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-900/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setSectionOpen((prev) => ({ ...prev, [section.provider]: !prev[section.provider] }))
                  }
                  className="flex w-full items-center justify-between gap-2 rounded-t-2xl px-4 py-3 text-left"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="text-base">
                      {section.provider === "github" ? "🔑" :
                       section.provider === "dashscope" ? "🤖" :
                       section.provider === "openai" ? "🧠" :
                       section.provider === "anthropic" ? "🟣" :
                       section.provider === "google" ? "💎" : "🛰"}
                    </span>
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
                      </div>
                      {section.hint && (
                        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-zinc-500 dark:text-zinc-400">
                          {section.hint}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fillDemo(section.provider);
                        if (!sectionOpen[section.provider]) {
                          setSectionOpen((prev) => ({ ...prev, [section.provider]: true }));
                        }
                      }}
                      className="hidden h-7 rounded-md border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 sm:inline-flex"
                    >
                      填充默认模型名
                    </button>
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition-transform dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 ${
                        open ? "rotate-180" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </div>
                </button>

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
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onReset}
            className="h-9 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            🗑 清空本机配置
          </button>
          <button
            type="button"
            onClick={onSave}
            className="h-9 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:brightness-110"
          >
            💾 保存到浏览器（本地）
          </button>
        </div>
      </section>
    </div>
  );
}

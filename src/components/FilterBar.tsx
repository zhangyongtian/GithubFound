"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGES, TOPICS, SORT_OPTIONS, SINCE_OPTIONS } from "@/lib/types";
import { attachSettingsHeaders } from "@/lib/clientSettings";

type RewriteResp = {
  success: boolean;
  mode: "ai" | "fallback";
  used: boolean;
  originalQuery: string;
  rewrittenQuery: string;
  explanation: string;
  provider?: string;
  model?: string;
  fallbackLevel?: number;
  rewriteTotalCount?: number;
  originalTotalCount?: number;
  suggestions?: {
    stars?: string;
    pushed?: string;
    language?: string;
    topics?: string[];
  };
};

type AiStatusResp = {
  enabled: boolean;
  provider?: string;
  model?: string;
  displayName: string;
};

type HotSuggestion = {
  label: string;
  emoji: string;
  recommendedQuery: string;
  sampleRepo?: string;
  sampleStars?: number;
  count: number;
  topics?: string[];
};

const FALLBACK_QUICK_CHIPS: HotSuggestion[] = [
  { label: "Claude Agent", emoji: "🤖", recommendedQuery: "claude agent", count: 0, topics: ["agent", "claude"] },
  { label: "YOLO 目标检测", emoji: "🚀", recommendedQuery: "yolov", count: 0, topics: ["yolov8", "object-detection"] },
  { label: "LLM 推理框架", emoji: "🧠", recommendedQuery: "llm inference framework", count: 0, topics: ["llm", "inference"] },
  { label: "前端 UI 组件库", emoji: "🎨", recommendedQuery: "ui components react", count: 0, topics: ["ui", "components", "react"] },
  { label: "开发工具 CLI", emoji: "🛠", recommendedQuery: "developer tools cli", count: 0, topics: ["cli", "devtools"] },
  { label: "Rust 高性能项目", emoji: "🦀", recommendedQuery: "rust high performance", count: 0, topics: ["rust", "high-performance"] },
  { label: "RAG / 知识库", emoji: "📚", recommendedQuery: "rag knowledge base", count: 0, topics: ["rag", "vector"] },
];

export default function FilterBar({ mode }: { mode: "trending" | "search" }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [searching, setSearching] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatusResp | null>(null);
  const [hotChips, setHotChips] = useState<HotSuggestion[] | null>(null);
  const [hotLoading, setHotLoading] = useState(false);
  const navigatingFromInputRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai-status", attachSettingsHeaders({ cache: "no-store" }))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AiStatusResp | null) => {
        if (alive && d) setAiStatus(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const loadHotSuggestions = useCallback(async (force = false) => {
    if (mode !== "search") return;
    setHotLoading(true);
    try {
      const qs = new URLSearchParams({ since: "monthly", perPage: "21" });
      if (force) qs.set("revalidate", "1");
      const res = await fetch(
        `/api/hot-suggestions?${qs.toString()}`,
        attachSettingsHeaders({ cache: "no-store" })
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { success?: boolean; suggestions?: HotSuggestion[] };
      if (d.success && Array.isArray(d.suggestions) && d.suggestions.length > 0) {
        setHotChips(d.suggestions);
      } else {
        setHotChips(FALLBACK_QUICK_CHIPS);
      }
    } catch {
      setHotChips((prev) => prev || FALLBACK_QUICK_CHIPS);
    } finally {
      setHotLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "search") return;
    void loadHotSuggestions();
  }, [mode, loadHotSuggestions]);

  useEffect(() => {
    if (!searching) return;
    const id = setTimeout(() => setSearching(false), 800);
    return () => clearTimeout(id);
  }, [searching]);

  const initialQuery = useMemo(() => sp.get("query") || "", [sp]);

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [rwExplanation, setRwExplanation] = useState<string | null>(null);
  const navigatingTokenRef = useRef<number | null>(null);
  const navigatingExpectedRef = useRef<string | null>(null);

  useEffect(() => {
    const expected = initialQuery;
    if (navigatingTokenRef.current !== null) {
      const token = navigatingTokenRef.current;
      const navExpected = navigatingExpectedRef.current;
      navigatingTokenRef.current = null;
      navigatingExpectedRef.current = null;
      if (navExpected === expected) {
        return;
      }
      setQueryInput(expected);
      setRwExplanation(null);
      void token;
      return;
    }
    setQueryInput((prev) => {
      if (prev === expected) return prev;
      return expected;
    });
  }, [initialQuery]);

  const runRewriteDirect = useCallback(
    (rawQuery: string) => {
      navigatingTokenRef.current = null;
      navigatingExpectedRef.current = null;
      setRewriting(true);
      setRwExplanation(null);
      const hotPromise = loadHotSuggestions(true).catch(() => {});
      const currentLang = sp.get("language");
      const currentTopic = sp.get("topic");
      const rwQs = new URLSearchParams();
      rwQs.set("q", rawQuery);
      rwQs.set("revalidate", "1");
      if (currentLang) rwQs.set("language", currentLang);
      if (currentTopic) rwQs.set("topic", currentTopic);
      const rwPromise = fetch(`/api/rewrite-query?${rwQs.toString()}`, attachSettingsHeaders({ cache: "no-store" }))
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return (await res.json()) as RewriteResp;
        })
        .then((rw) => {
          navigatingTokenRef.current = null;
          navigatingExpectedRef.current = null;
          const rewritten = rw.success && rw.rewrittenQuery ? rw.rewrittenQuery : rawQuery;
          setQueryInput(rewritten);
          setRwExplanation(rw.explanation || null);
        })
        .catch(() => {
          navigatingTokenRef.current = null;
          navigatingExpectedRef.current = null;
          setQueryInput(rawQuery);
          setRwExplanation(null);
        });
      Promise.all([rwPromise, hotPromise]).finally(() => {
        setRewriting(false);
      });
    },
    [sp, loadHotSuggestions]
  );

  const applyParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      const qs = next.toString();
      const target = qs ? `${pathname}?${qs}` : pathname;
      setSearching(true);
      const patchQuery = patch.query;
      if (patchQuery !== undefined) {
        const token = (navigatingTokenRef.current ?? 0) + 1;
        navigatingTokenRef.current = token;
        navigatingExpectedRef.current = patchQuery || null;
      }
      router.replace(target, { scroll: false });
    },
    [router, pathname, sp]
  );

  const updateParams = useCallback(
    (patch: Record<string, string | null>, opts?: { forceRewrite?: boolean }) => {
      if (
        patch.query !== undefined &&
        mode === "search" &&
        patch.query &&
        opts?.forceRewrite
      ) {
        runRewriteDirect(patch.query);
        return;
      }
      if (patch.query !== undefined) {
        setRwExplanation(null);
      }
      applyParams(patch);
    },
    [applyParams, runRewriteDirect, mode]
  );

  const currentLang = sp.get("language") || "";
  const currentTopic = sp.get("topic") || "";
  const currentSort = sp.get("sort") || "stars";
  const currentSince = sp.get("since") || "daily";
  const currentQuery = sp.get("query") || "";

  const aiName = aiStatus?.displayName || "AI";
  const hotSugs: HotSuggestion[] =
    hotChips && hotChips.length > 0 ? hotChips : FALLBACK_QUICK_CHIPS;
  const hotTitle = mode === "search" && !hotLoading ? "本月 GitHub 热门方向" : "快速试试";

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30 sm:p-5">
      {mode === "search" && (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              关键词搜索
            </label>
            <div className="flex items-center gap-2">
              {aiStatus?.enabled && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-50 to-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 shadow-sm ring-1 ring-violet-200 dark:from-indigo-500/10 dark:to-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30"
                  title={`当前使用 ${aiStatus.provider || "AI"} · ${aiStatus.model || "default model"}`}
                >
                  <span className="-mt-0.5">🧠</span>
                  {aiName} 就绪
                </span>
              )}
              {(searching || rewriting) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  {rewriting ? `${aiName}优化中…` : "正在搜索…"}
                </span>
              )}
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const final = queryInput.trim();
              updateParams({ query: final || null });
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                🔍
              </span>
              <input
                name="q"
                value={queryInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setQueryInput(val);
                  if (rwExplanation) setRwExplanation(null);
                }}
                placeholder="如: 编程工具, 前端组件库, yolov 相关..."
                className={`h-11 w-full rounded-xl border bg-zinc-50 pl-9 pr-28 text-sm outline-none transition-colors focus:bg-white focus:ring-4 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:bg-zinc-900 ${
                  rwExplanation
                    ? "border-violet-300 focus:border-violet-400 focus:ring-violet-500/10 dark:border-violet-500/40"
                    : "border-zinc-200 focus:border-indigo-400 focus:ring-indigo-500/10 dark:border-zinc-700"
                }`}
              />
              <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <button
                  type="button"
                  disabled={rewriting || searching || !queryInput.trim() || !aiStatus?.enabled}
                  onClick={() =>
                    updateParams({ query: queryInput.trim() }, { forceRewrite: true })
                  }
                  className={`h-8 rounded-lg px-2 text-xs font-semibold transition-all disabled:opacity-40 ${
                    rwExplanation
                      ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/20 hover:brightness-110"
                      : "border border-violet-200 bg-white text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-500/10"
                  }`}
                  title={`用 ${aiName} 优化关键词（直接替换输入框）`}
                >
                  ✨ 魔法棒
                </button>
                {queryInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setQueryInput("");
                      setRwExplanation(null);
                      updateParams({ query: null });
                    }}
                    className="h-8 w-8 rounded-full text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    title="清空"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 px-5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-wait"
            >
              {searching ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  搜索中
                </>
              ) : (
                <>
                  <span>🔎</span> 搜索
                </>
              )}
            </button>
          </form>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => void loadHotSuggestions(true)}
              disabled={hotLoading}
              className="group inline-flex items-center gap-1 rounded-full bg-zinc-100/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 ring-1 ring-zinc-200 transition-all hover:bg-indigo-50 hover:text-indigo-700 hover:ring-indigo-200 disabled:opacity-60 dark:bg-zinc-800/60 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300 dark:hover:ring-indigo-500/30"
              title="点击强制刷新本月热门方向"
            >
              <span className={`transition-transform ${hotLoading ? "animate-spin" : "group-hover:scale-110"}`}>🔥</span>
              {hotTitle}
              {hotLoading ? (
                <span className="ml-0.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">（刷新中…）</span>
              ) : (
                <span className="ml-0.5 text-[10px] font-medium text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-500">↻ 刷新</span>
              )}
            </button>
            {hotSugs.map((c) => {
              const sampleRepo = c.sampleRepo?.trim();
              return (
                <button
                  key={c.label + (sampleRepo || c.recommendedQuery)}
                  type="button"
                  onClick={() => {
                    const q = (c.recommendedQuery || c.label).trim();
                    setQueryInput(q);
                    updateParams({ query: q });
                  }}
                  className="group inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
                  title={
                    sampleRepo
                      ? `搜索：${(c.recommendedQuery || c.label).trim()}   ·   代表项目：${sampleRepo}${c.sampleStars ? ` ⭐${c.sampleStars}` : ""}`
                      : `搜索：${(c.recommendedQuery || c.label).trim()}`
                  }
                >
                  <span>{c.emoji}</span>
                  <span className="font-semibold tracking-wide">{c.label}</span>
                  {c.count > 0 && (
                    <span className="ml-0.5 inline-flex items-center rounded-full bg-white/70 px-1.5 text-[9.5px] font-bold text-zinc-500 ring-1 ring-zinc-200/80 dark:bg-zinc-900/50 dark:text-zinc-400 dark:ring-zinc-700/80">
                      {c.count >= 1000 ? `${(c.count / 1000).toFixed(1)}k` : c.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {(queryInput.trim() || currentQuery) && (
            <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              <span>当前关键词：</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                「{queryInput.trim() || currentQuery}」
                {queryInput.trim() && (
                  <button
                    type="button"
                    onClick={() => updateParams({ query: null })}
                    className="ml-0.5 h-4 w-4 rounded-full text-indigo-500 transition-colors hover:bg-indigo-200 hover:text-indigo-800 dark:hover:bg-indigo-500/30 dark:hover:text-indigo-100"
                    title="删除关键词"
                  >
                    ✕
                  </button>
                )}
              </span>
              {rwExplanation && (
                <span className="rounded-full bg-zinc-50 px-2.5 py-0.5 text-[11px] text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:ring-zinc-700">
                  💡 {rwExplanation}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {mode === "trending" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            热门时间范围
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SINCE_OPTIONS.map((opt) => {
              const active = currentSince === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateParams({ since: opt.value })}
                  className={`h-9 rounded-xl px-3.5 text-sm font-medium transition-all ${
                    active
                      ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-md shadow-orange-500/20"
                      : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  }`}
                >
                  🔥 {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          编程语言
        </label>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGES.map((lang) => {
            const active = currentLang === lang.value;
            return (
              <button
                key={lang.value || "all"}
                onClick={() => updateParams({ language: lang.value || null })}
                className={`h-8 rounded-full px-3 text-xs font-medium transition-all ${
                  active
                    ? "bg-zinc-900 text-white shadow-md shadow-zinc-500/20 dark:bg-white dark:text-zinc-900"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: active ? "#fff" : lang.color }}
                />
                {lang.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          项目分类 / Topic
        </label>
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map((t) => {
            const active = currentTopic === t.value;
            return (
              <button
                key={t.value || "all-topic"}
                onClick={() => updateParams({ topic: t.value || null })}
                className={`h-8 rounded-full px-3 text-xs font-medium transition-all ${
                  active
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                    : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                }`}
              >
                <span className="mr-1">{t.emoji}</span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          排序方式
        </label>
        <div className="flex flex-wrap gap-1.5">
          {SORT_OPTIONS.map((opt) => {
            const active = currentSort === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => updateParams({ sort: opt.value })}
                className={`h-8 rounded-lg px-3 text-xs font-medium transition-all ${
                  active
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

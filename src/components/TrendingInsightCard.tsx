"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { SINCE_VALUES } from "@/lib/types";
import { attachSettingsHeaders } from "@/lib/clientSettings";

type LangEntry = [string, number];
type TopicEntry = [string, number];

type TrendingInsightData = {
  success: boolean;
  error?: string | null;
  mode: "ai" | "fallback";
  insight: string;
  topLangs: LangEntry[];
  topTopics: TopicEntry[];
  sampleCount: number;
  since: SINCE_VALUES;
  provider?: string;
  model?: string;
  displayName?: string;
  topMovers?: Array<{
    rank: number;
    full_name: string;
    html_url: string;
    description: string | null;
    stargazers_count: number;
    language: string | null;
    velocity_delta: number;
  }>;
  trendingError?: string | null;
  aiError?: string | null;
};

type AiStatusResp = {
  enabled: boolean;
  provider?: string;
  model?: string;
  displayName: string;
};

type Props = {
  initialSince?: SINCE_VALUES;
  scope?: "trending" | "search";
  language?: string;
  topic?: string;
  sort?: string;
  query?: string;
};

const SINCE_LABEL: Record<SINCE_VALUES, string> = {
  daily: "今日",
  weekly: "本周",
  monthly: "本月",
};

const LANG_BADGE = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

const LANG_BAR = [
  "bg-gradient-to-r from-blue-400 to-sky-500",
  "bg-gradient-to-r from-emerald-400 to-teal-500",
  "bg-gradient-to-r from-amber-400 to-orange-500",
  "bg-gradient-to-r from-rose-400 to-pink-500",
  "bg-gradient-to-r from-violet-400 to-indigo-500",
];

const TOPIC_BAR = [
  "bg-gradient-to-r from-indigo-400 to-violet-500",
  "bg-gradient-to-r from-fuchsia-400 to-rose-500",
  "bg-gradient-to-r from-cyan-400 to-sky-500",
  "bg-gradient-to-r from-emerald-400 to-green-500",
  "bg-gradient-to-r from-amber-400 to-yellow-500",
  "bg-gradient-to-r from-pink-400 to-fuchsia-500",
];

type ParsedInsight = {
  overview: string;
  trends: Array<{
    idx: number;
    title: string;
    repos: string[];
    reason: string;
  }>;
  suggestions: string[];
};

const TREND_CARD_STYLES = [
  {
    border: "border-indigo-300/80",
    bg: "bg-gradient-to-br from-indigo-50 via-white to-violet-50",
    accent: "bg-gradient-to-br from-indigo-500 to-violet-600",
    text: "text-indigo-700",
    pill: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  },
  {
    border: "border-emerald-300/80",
    bg: "bg-gradient-to-br from-emerald-50 via-white to-teal-50",
    accent: "bg-gradient-to-br from-emerald-500 to-teal-600",
    text: "text-emerald-700",
    pill: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  },
  {
    border: "border-amber-300/80",
    bg: "bg-gradient-to-br from-amber-50 via-white to-orange-50",
    accent: "bg-gradient-to-br from-amber-500 to-orange-600",
    text: "text-amber-700",
    pill: "bg-amber-100 text-amber-700 ring-amber-200",
  },
  {
    border: "border-rose-300/80",
    bg: "bg-gradient-to-br from-rose-50 via-white to-pink-50",
    accent: "bg-gradient-to-br from-rose-500 to-pink-600",
    text: "text-rose-700",
    pill: "bg-rose-100 text-rose-700 ring-rose-200",
  },
  {
    border: "border-cyan-300/80",
    bg: "bg-gradient-to-br from-cyan-50 via-white to-sky-50",
    accent: "bg-gradient-to-br from-cyan-500 to-sky-600",
    text: "text-cyan-700",
    pill: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  },
];

function parseInsight(raw: string): ParsedInsight | null {
  if (!raw || typeof raw !== "string") return null;
  const text = raw.trim();

  const cleanMdHeader = (s: string) => s.replace(/^#{1,6}\s*/, "").trim();
  const stripNumeric = (s: string) => s.replace(/^\s*\d+\s*[.、\)．]\s*/, "").trim();
  const stripBrackets = (s: string) => {
    const m = s.match(/^【([^】]+)】\s*(.*)$/) || s.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (m) return (m[2] || m[1]).trim();
    return s.trim();
  };
  const extractRepoParts = (s: string) => {
    const rest = s
      .replace(/^代表项目[：:]\s*/i, "")
      .replace(/^代表[：:]\s*/i, "")
      .replace(/（[^（）]*）/g, " ")
      .replace(/\([^()]*\)/g, " ")
      .trim();
    const items = rest
      .split(/[，,；;]/)
      .map((x) => x.trim())
      .filter((x) => {
        if (!x) return false;
        if (/^代表项目?[：:]?$/i.test(x)) return false;
        if (/^代表$/i.test(x)) return false;
        if (!/[A-Za-z0-9]/.test(x)) return false;
        return true;
      });
    return items.length > 0 ? items : [];
  };
  const addRepos = (target: string[] | null | undefined, rawLine: string) => {
    const picked = extractRepoParts(rawLine);
    if (!picked.length) return;
    const seen = new Set(target || []);
    for (const p of picked) {
      if (!seen.has(p)) {
        target ? target.push(p) : void 0;
        seen.add(p);
      }
    }
  };

  let overview = "";
  const trends: ParsedInsight["trends"] = [];
  const suggestions: string[] = [];

  let stage: "init" | "overview" | "trends" | "suggestions" = "init";
  const lines = text.split(/\r?\n/);

  let curTrend: ParsedInsight["trends"][number] | null = null;
  const flushTrend = () => {
    if (curTrend) {
      trends.push(curTrend);
      curTrend = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "");
    if (!line.trim()) continue;

    const lower = line.trim().toLowerCase();
    if (/^##?\s*总体/.test(lower) || /^##?\s*总览/.test(lower) || /^##?\s*结论/.test(lower)) {
      flushTrend();
      stage = "overview";
      continue;
    }
    if (/^##?\s*趋势/.test(lower) || /^##?\s*方向/.test(lower) || /^##?\s*榜单/.test(lower)) {
      flushTrend();
      stage = "trends";
      continue;
    }
    if (/^##?\s*建议/.test(lower) || /^##?\s*行动/.test(lower)) {
      flushTrend();
      stage = "suggestions";
      continue;
    }
    if (/^##?\s*/.test(line.trim())) {
      flushTrend();
      stage = "init";
    }

    if (stage === "init") {
      if (!overview) overview = cleanMdHeader(line);
      continue;
    }

    if (stage === "overview") {
      const c = cleanMdHeader(line);
      if (c) overview = overview ? `${overview} ${c}` : c;
      continue;
    }

    if (stage === "suggestions") {
      const cand = stripNumeric(line).replace(/^[-*•]\s*/, "").trim();
      if (cand) suggestions.push(cand.replace(/^建议[：:]\s*/, "").trim());
      continue;
    }

    if (stage === "trends") {
      const l = line.trim();
      if (/^\d+\s*[.、\)．]/.test(l)) {
        flushTrend();
        const title = stripBrackets(stripNumeric(l));
        curTrend = { idx: trends.length + 1, title, repos: [], reason: "" };
        continue;
      }
      if (/^代表项目[：:]/.test(l) || /^代表[：:]/.test(l)) {
        if (!curTrend) curTrend = { idx: trends.length + 1, title: "重点方向", repos: [], reason: "" };
        addRepos(curTrend.repos, l);
        continue;
      }
      if (/^为什么火[：:]/.test(l) || /^原因[：:]/.test(l) || /^亮点[：:]/.test(l) || /^说明[：:]/.test(l)) {
        if (!curTrend) curTrend = { idx: trends.length + 1, title: "重点方向", repos: [], reason: "" };
        const rest = l.replace(/^(为什么火|原因|亮点|说明)[：:]\s*/, "").trim();
        curTrend.reason = curTrend.reason ? `${curTrend.reason} ${rest}` : rest;
        continue;
      }
      if (/^[-*•]\s*/.test(l) || /^\s+/.test(line)) {
        if (curTrend) {
          const plain = l.replace(/^[-*•]\s*/, "").trim();
          if (/^代表项目[：:]/.test(plain) || /^代表[：:]/.test(plain)) {
            addRepos(curTrend.repos, plain);
          } else if (/^为什么火[：:]/.test(plain) || /^原因[：:]/.test(plain)) {
            const rest = plain.replace(/^(为什么火|原因)[：:]\s*/, "").trim();
            curTrend.reason = curTrend.reason ? `${curTrend.reason} ${rest}` : rest;
          } else {
            curTrend.reason = curTrend.reason ? `${curTrend.reason} ${plain}` : plain;
          }
          continue;
        }
      }
      if (curTrend) {
        curTrend.reason = curTrend.reason ? `${curTrend.reason} ${l}` : l;
      }
    }
  }
  flushTrend();

  if (!overview && !trends.length && !suggestions.length) {
    const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (paragraphs.length >= 2) {
      overview = paragraphs[0];
      const tail = paragraphs[paragraphs.length - 1];
      if (/建议|推荐|值得/.test(tail)) {
        suggestions.push(...tail.split(/[。；;\n]/).map((s) => s.trim()).filter((s) => /建议|值得|应该|可以/.test(s) || s.length < 40));
      }
      const body = paragraphs.slice(1, /建议|推荐|值得/.test(paragraphs[paragraphs.length - 1]) ? -1 : undefined);
      for (let i = 0; i < body.length; i++) {
        const p = body[i];
        const title = p.split(/[。\n]/)[0].slice(0, 40);
        const repoMatch = p.match(/代表项目[：:]\s*([^。\n]+)/);
        trends.push({
          idx: i + 1,
          title: stripNumeric(title.replace(/^\d+\s*[.、\)．]\s*/, "")),
          repos: repoMatch ? extractRepoParts(repoMatch[0]) : [],
          reason: p.replace(/^\d+\s*[.、\)．]\s*/, "").trim(),
        });
      }
    }
    if (!overview) overview = text;
  }

  return {
    overview: overview.trim(),
    trends: trends
      .map((t) => {
        const seen = new Set<string>();
        const cleanRepos: string[] = [];
        for (const r of t.repos) {
          const x = r.trim();
          if (!x) continue;
          const core = x.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/)?.[0];
          const k = core || x;
          if (seen.has(k)) continue;
          seen.add(k);
          cleanRepos.push(x);
        }
        const extra = t.reason.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\s*⭐?\s*[0-9,]{2,})?/g) || [];
        for (const m of extra) {
          const core = m.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/)?.[0];
          if (!core || seen.has(core)) continue;
          seen.add(core);
          cleanRepos.push(m);
        }
        return { ...t, repos: cleanRepos };
      })
      .filter((t) => t.title || t.reason),
    suggestions: suggestions.filter((s) => s && s.length > 0),
  };
}

function RepoChip({
  text,
  style,
}: {
  text: string;
  style: { pill: string; accent: string };
}) {
  const t = text.trim();
  if (!t) return null;
  const ownerRepo = t.match(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/)?.[1];
  if (!ownerRepo) return null;
  const starMatch = t.match(/⭐?\s*([0-9,]{2,})/);
  const restRaw = t
    .replace(/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g, "")
    .replace(/⭐?\s*[0-9,]{2,}/g, "")
    .replace(/^[,，\s、]+|[,，\s、]+$/g, "")
    .trim();
  const rest =
    restRaw && !/^代表/.test(restRaw) && restRaw.length <= 10 ? restRaw : "";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ${style.pill}`}>
      <span className={`inline-flex h-1.5 w-1.5 rounded-full ${style.accent}`} />
      <span className="font-black tracking-tight">{ownerRepo}</span>
      {starMatch && (
        <span className="inline-flex items-center gap-0.5 text-amber-600">
          ⭐{starMatch[1]}
        </span>
      )}
      {rest && <span className="opacity-75">· {rest}</span>}
    </span>
  );
}

function InsightView({ insight }: { insight: string }) {
  const parsed = useMemo(() => parseInsight(insight), [insight]);
  if (!parsed) return null;

  return (
    <div className="mt-4 space-y-4 text-[14.5px] leading-[1.85]">
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4">
        <div className="absolute -top-12 -right-10 h-32 w-32 rounded-full bg-indigo-400/15 blur-3xl" />
        <div className="absolute -bottom-12 -left-10 h-28 w-28 rounded-full bg-violet-400/15 blur-3xl" />
        <div className="relative flex gap-3">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-black text-white shadow-sm">
            总
          </span>
          <p className="font-semibold text-slate-800 tracking-wide">
            {parsed.overview}
          </p>
        </div>
      </div>

      {parsed.trends.length > 0 && (
        <div className="grid gap-3">
          {parsed.trends.map((t, i) => {
            const s = TREND_CARD_STYLES[i % TREND_CARD_STYLES.length];
            return (
              <div
                key={t.idx + t.title + i}
                className={`group relative overflow-hidden rounded-2xl border ${s.border} ${s.bg} p-4 transition-all hover:-translate-y-0.5 hover:shadow-md`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white shadow-sm ${s.accent}`}>
                    {t.idx}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className={`font-extrabold ${s.text} tracking-wide`}>
                      {t.title || "重点方向"}
                    </h4>
                    {t.repos.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {(t.repos.length <= 4 ? t.repos : t.repos.slice(0, 4)).map((r, j) => (
                          <RepoChip key={j} text={r} style={s} />
                        ))}
                        {t.repos.length > 4 && (
                          <span
                            className={`inline-flex h-[26px] items-center rounded-full px-2.5 text-[11px] font-bold ring-1 ${s.pill}`}
                            title={t.repos.slice(4).map((r) => r.match(/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/)?.[0] || r).join(" · ")}
                          >
                            +{t.repos.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    {t.reason && (
                      <p className="mt-2 text-[13.5px] text-slate-700">
                        {t.reason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {parsed.suggestions.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-white to-yellow-50 p-4">
          <div className="absolute -top-10 -right-8 h-28 w-28 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-xs font-black text-white shadow-sm">
              💡
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="font-extrabold text-amber-700 tracking-wide">
                开发者建议
              </h4>
              <ul className="mt-2 space-y-1.5 text-[13.5px] text-slate-700">
                {parsed.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!parsed.trends.length && !parsed.suggestions.length && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-700 whitespace-pre-wrap">
          {insight}
        </div>
      )}
    </div>
  );
}

export default function TrendingInsightCard(props: Props) {
  const { initialSince = "daily", scope = "trending", language, topic, sort, query } = props;
  const router = useRouter();
  const pathname = usePathname();
  const urlSP = useSearchParams();
  const urlSince = (urlSP?.get("since") as SINCE_VALUES | null) || null;

  const [since, setSince] = useState<SINCE_VALUES>(urlSince || initialSince);
  const [data, setData] = useState<TrendingInsightData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatusResp | null>(null);
  const reqSerialRef = { current: 0 };

  useEffect(() => {
    if (urlSince && urlSince !== since) setSince(urlSince);
  }, [urlSince, since]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setErrorMsg(null);
    fetch("/api/ai-status", attachSettingsHeaders({ cache: "no-store" }))
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AiStatusResp | null) => {
        if (alive && d) setAiStatus(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [since]);

  const endpointQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("since", since);
    if (language) p.set("language", language);
    if (topic) p.set("topic", topic);
    if (sort) p.set("sort", sort);
    return p.toString();
  }, [since, language, topic, sort]);

  const setSinceWithUrl = useCallback(
    (nextSince: SINCE_VALUES) => {
      setSince(nextSince);
      const target = new URLSearchParams(urlSP?.toString() || "");
      target.set("since", nextSince);
      target.delete("page");
      const qs = target.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, urlSP]
  );

  const load = useCallback(
    async (revalidate = false) => {
      const serial = ++reqSerialRef.current;
      setLoading(true);
      setErrorMsg(null);
      if (revalidate) {
        setData(null);
      }
      try {
        const url = `/api/trending-insight?${endpointQuery}${revalidate ? "&revalidate=1" : ""}`;
        const res = await fetch(url, attachSettingsHeaders({ cache: "no-store" }));
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${t || res.statusText}`);
        }
        const d = (await res.json()) as TrendingInsightData;
        if (!d.success) {
          throw new Error(d.error || "风向数据加载失败");
        }
        if (serial !== reqSerialRef.current) return;
        setData(d);
      } catch (e) {
        if (serial !== reqSerialRef.current) return;
        setErrorMsg(e instanceof Error ? e.message : "未知错误");
      } finally {
        if (serial === reqSerialRef.current) {
          setLoading(false);
        }
      }
    },
    [endpointQuery]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const title =
    scope === "search" && query
      ? `🔍「${query}」搜索方向风向标`
      : `🚀 GitHub 热门风向标`;

  return (
    <section className="rounded-3xl border border-gradient-to-br from-indigo-400/50 via-violet-400/40 to-fuchsia-400/40 bg-white/85 backdrop-blur shadow-[0_10px_40px_-15px_rgba(99,102,241,0.35)] p-6 md:p-7">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            基于最新 GitHub 热门项目，结合 AI 提炼技术方向 + 飙升项目榜单，让你最快把握最近风向标
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div role="tablist" className="inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
            {(Object.keys(SINCE_LABEL) as SINCE_VALUES[]).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={since === k}
                onClick={() => setSinceWithUrl(k)}
                className={`px-3.5 py-1.5 rounded-full transition-all ${
                  since === k
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {SINCE_LABEL[k]}
              </button>
            ))}
          </div>

          <button
            onClick={() => load(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-500/30 hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed transition"
            title="强制刷新（会跳过缓存）"
          >
            <svg
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            刷新风向
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-indigo-50/50 p-5 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-violet-400/15 blur-2xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              {data?.mode !== "fallback" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 text-white text-[11px] font-bold px-2.5 py-1 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  {(data?.displayName || data?.provider ? (data.displayName || data.provider) : (aiStatus?.displayName || "AI")) + " 生成"}
                </span>
              )}
              {data?.mode === "fallback" && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-600 text-white text-[11px] font-bold px-2.5 py-1 shadow-sm"
                  title={
                    data?.aiError
                      ? `AI 生成失败：${data.aiError}`
                      : aiStatus?.enabled
                        ? "AI 已配置但当前返回空，已自动降级本地统计，点右上角「刷新风向」可重试"
                        : "尚未配置大模型 API Key，可点右上角齿轮去「大模型apikey设置」，保存后回来点刷新风向"
                  }
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-200 animate-pulse" />
                  本地分析（未走 AI）
                </span>
              )}
              <span className="rounded-full bg-slate-900/90 text-white text-[11px] font-semibold px-2.5 py-1">
                {SINCE_LABEL[since]} · {data?.sampleCount ?? "—"} 个样本
              </span>
              {(data?.provider || data?.model) && data?.mode !== "fallback" && (
                <span
                  className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700"
                  title={`${data?.provider || "AI"} · ${data?.model || "default"}`}
                >
                  {(data?.provider || "AI") +
                    (data?.model ? ` / ${data.model.split("/").pop()}` : "")}
                </span>
              )}
            </div>

            {loading && !data && (
              <div className="mt-4 space-y-2.5">
                <div className="h-4 w-3/4 rounded-lg bg-slate-200 animate-pulse" />
                <div className="h-4 w-full rounded-lg bg-slate-200 animate-pulse" />
                <div className="h-4 w-11/12 rounded-lg bg-slate-200 animate-pulse" />
                <div className="h-4 w-5/6 rounded-lg bg-slate-200 animate-pulse" />
                <div className="h-4 w-2/3 rounded-lg bg-slate-200 animate-pulse" />
              </div>
            )}

            {errorMsg && !data && (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-700">
                趋势加载失败：{errorMsg}
              </div>
            )}

            {data?.insight && (
              <InsightView insight={data.insight} />
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-6">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">🔥 热门编程语言</h3>
              <span className="text-[11px] text-slate-400">
                Top {data?.topLangs.length ?? 5}
              </span>
            </div>
            {loading && !data ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-16 h-3 rounded-full bg-slate-200 animate-pulse shrink-0" />
                    <div
                      className="h-3 rounded-full bg-slate-200 animate-pulse"
                      style={{ width: 40 + ((4 - i) * 15) + "%" }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {(data?.topLangs || []).slice(0, 5).map(([name, count], i) => {
                  const max = Math.max(...(data?.topLangs || []).map(([, c]) => c), 1);
                  const pct = Math.max(6, Math.round((count / max) * 100));
                  return (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-700">
                          {String(i + 1).padStart(2, "0")}. {name}
                        </span>
                        <span className="text-slate-500">{count}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                        <div
                          className={`h-full rounded-full ${
                            LANG_BAR[i % LANG_BAR.length]
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">🧩 热门 Topics</h3>
              <span className="text-[11px] text-slate-400">
                Top {Math.min(10, data?.topTopics.length ?? 10)}
              </span>
            </div>
            {loading && !data ? (
              <div className="mt-3 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-20 h-3 rounded-full bg-slate-200 animate-pulse shrink-0" />
                    <div
                      className="h-3 rounded-full bg-slate-200 animate-pulse"
                      style={{ width: 30 + ((8 - i) * 9) + "%" }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {(data?.topTopics || []).slice(0, 10).map(([tag, count], i) => {
                  const max = Math.max(...(data?.topTopics || []).map(([, c]) => c), 1);
                  const pct = Math.max(6, Math.round((count / max) * 100));
                  return (
                    <div key={tag} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-700">#{tag}</span>
                        <span className="text-slate-500">{count}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800">
                        <div
                          className={`h-full rounded-full ${
                            TOPIC_BAR[i % TOPIC_BAR.length]
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {data?.topMovers?.length ? (
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">🚀 飙升榜 Top 3</h3>
                <span className="text-[11px] text-slate-400">Weekly vs Daily 名次提升</span>
              </div>
              <div className="mt-3 grid gap-2">
                {data.topMovers.map((m, i) => (
                  <a
                    key={m.full_name}
                    href={m.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-xl border border-zinc-200 bg-gradient-to-br from-white via-zinc-50 to-orange-50/40 p-3 transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md hover:shadow-orange-500/10 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-900 dark:to-orange-500/10 dark:hover:border-orange-500/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-rose-500 text-[10px] font-black text-white shadow-sm">
                            {i + 1}
                          </span>
                          <span className="truncate text-[13px] font-bold text-slate-900 group-hover:text-orange-700 dark:text-zinc-100 dark:group-hover:text-orange-400">
                            {m.full_name}
                          </span>
                          {m.language && (
                            <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                              {m.language}
                            </span>
                          )}
                        </div>
                        {m.description && (
                          <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-zinc-600 dark:text-zinc-400">
                            {m.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10.5px] font-semibold">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        ⭐ {m.stargazers_count.toLocaleString()}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 ${
                          m.velocity_delta > 0
                            ? "text-rose-600 dark:text-rose-400"
                            : m.velocity_delta < 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-500"
                        }`}
                      >
                        {m.velocity_delta > 0 ? "↑" : m.velocity_delta < 0 ? "↓" : "→"}
                        名次 {m.velocity_delta > 0 ? "+" : ""}{m.velocity_delta}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

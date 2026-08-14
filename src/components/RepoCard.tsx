"use client";

import { useEffect, useMemo, useState } from "react";
import type { GithubRepo } from "@/lib/types";
import { formatCount, timeAgo, langColor } from "@/lib/utils";
import { attachSettingsHeaders } from "@/lib/clientSettings";

interface Props {
  repo: GithubRepo;
  index: number;
  totalStars?: number;
  items?: GithubRepo[];
  since?: "daily" | "weekly" | "monthly";
  origQuery?: string;
}

type SummarizeState = {
  loading: boolean;
  summary?: string;
  readmeSnippet?: string;
  mode?: "ai" | "fallback";
  error?: string;
};

type AiStatusResp = {
  enabled: boolean;
  provider?: string;
  model?: string;
  displayName: string;
};

function splitRepoSummary(text: string): { head?: string; bullets?: string[]; tail?: string } {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return {};
  const paragraphs = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 1) {
    const ps = paragraphs[0];
    const lines = ps.split(/\n/).map((l) => l.trim());
    if (lines.length >= 3) {
      const first = lines[0];
      const last = lines[lines.length - 1];
      const mid = lines.slice(1, -1);
      const bullets = mid.map((l) => l.replace(/^[•·\-\s]+/, "").replace(/^[0-9]+[.、\)．]\s*/, "").trim()).filter(Boolean);
      if (bullets.length >= 2) return { head: first, bullets, tail: last };
    }
    return { head: ps };
  }
  if (paragraphs.length === 2) return { head: paragraphs[0], tail: paragraphs[1] };
  const [head, ...rest] = paragraphs;
  const tail = rest.length >= 2 ? rest[rest.length - 1] : undefined;
  const mid = tail ? rest.slice(0, -1) : rest;
  const bullets = mid
    .flatMap((p) => p.split(/\n/))
    .map((l) => l.trim())
    .map((l) => l.replace(/^[•·\-\s]+/, "").replace(/^[0-9]+[.、\)．]\s*/, "").trim())
    .filter(Boolean);
  return { head, bullets: bullets.length ? bullets : mid, tail };
}

function SummaryView({ text, mode }: { text: string; mode?: "ai" | "fallback" }) {
  const parts = useMemo(() => (mode === "ai" ? splitRepoSummary(text) : { head: text }), [text, mode]);
  return (
    <div className="space-y-2.5 text-[14px] leading-relaxed text-zinc-800 dark:text-zinc-200">
      {parts.head && (
        <p className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {parts.head}
        </p>
      )}
      {parts.bullets && parts.bullets.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-white/60 p-3 text-[13.5px] ring-1 ring-indigo-100/70 dark:bg-white/5 dark:ring-indigo-400/10">
          {parts.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {parts.tail && (
        <p className="rounded-xl bg-amber-50/60 p-3 text-[13px] text-zinc-700 ring-1 ring-amber-200/70 dark:bg-amber-500/5 dark:text-zinc-300 dark:ring-amber-400/10">
          {parts.tail}
        </p>
      )}
      {!parts.head && !parts.bullets && !parts.tail && (
        <p className="whitespace-pre-wrap">{text}</p>
      )}
    </div>
  );
}

export default function RepoCard({
  repo,
  index,
  totalStars,
  items,
  since = "weekly",
  origQuery,
}: Props) {
  const [summarize, setSummarize] = useState<SummarizeState | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatusResp | null>(null);

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

  const {
    isTopByStars,
    isHotRecent,
    isExactMatch,
    starBand,
  } = useMemo(() => {
    const maxStars = Math.max(
      repo.stargazers_count,
      ...(items || []).map((r) => r.stargazers_count || 0)
    );
    const topThreshold = Math.max(3, (items?.length || 0) >= 3 ? (items || [])[2]?.stargazers_count || 0 : 0);
    const isTopByStars =
      maxStars > 0 &&
      (repo.stargazers_count >= topThreshold ||
        (totalStars ? repo.stargazers_count / totalStars >= 0.0003 : false));

    const updatedAt = new Date(repo.updated_at || Date.now()).getTime();
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    const dayWindow =
      since === "daily" ? 1 * dayMs : since === "monthly" ? 30 * dayMs : 7 * dayMs;
    const isHotRecent = updatedAt >= now - dayWindow && repo.stargazers_count >= 500;

    const haystack = [
      repo.name,
      repo.full_name,
      repo.description || "",
      (repo.topics || []).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    const qTokens = (origQuery || "")
      .toLowerCase()
      .split(/[\s,，。、]+/)
      .filter(Boolean);
    const isExactMatch =
      !!origQuery &&
      qTokens.length > 0 &&
      qTokens.some((t) => t.length >= 2 && haystack.includes(t));

    let starBand: "🌟" | "⭐" | "" = "";
    if (repo.stargazers_count >= 50000) starBand = "🌟";
    else if (repo.stargazers_count >= 5000) starBand = "⭐";

    return { isTopByStars, isHotRecent, isExactMatch, starBand };
  }, [repo, items, totalStars, since, origQuery]);

  const aiName = aiStatus?.displayName || "AI";

  async function fetchSummary({ force = false }: { force?: boolean } = {}) {
    if (summarize?.loading) return;
    if (!force && summarize && (summarize.summary || summarize.readmeSnippet || summarize.error)) {
      setSummarize((prev) => (prev ? { ...prev, loading: true } : { loading: true }));
    } else {
      setSummarize({ loading: true });
    }
    try {
      const [owner, name] = repo.full_name.split("/");
      const params = new URLSearchParams();
      params.set("owner", owner);
      params.set("repo", name);
      if (force) params.set("revalidate", "1");
      if (repo.description) params.set("description", repo.description);
      const res = await fetch(`/api/summarize?${params.toString()}`, attachSettingsHeaders({ cache: "no-store" }));
      const data = await res.json();
      setSummarize({
        loading: false,
        summary: data.summary,
        readmeSnippet: data.readme_snippet,
        mode: data.mode,
        error: data.error,
      });
    } catch (e) {
      setSummarize((prev) => ({
        ...(prev || {}),
        loading: false,
        summary: prev?.summary,
        readmeSnippet: prev?.readmeSnippet,
        mode: prev?.mode,
        error: e instanceof Error ? e.message : "请求失败",
      }));
    }
  }

  const topRank =
    index < 3
      ? ["🥇", "🥈", "🥉"][index]
      : `#${index + 1}`;

  return (
    <div className="group relative rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 text-lg font-bold text-zinc-600 dark:from-zinc-800 dark:to-zinc-900 dark:text-zinc-300">
          {topRank}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-lg font-semibold text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400"
            >
              {repo.owner.login}
              <span className="text-zinc-400"> / </span>
              <span>{repo.name}</span>
            </a>
            {repo.owner.type === "Organization" && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                Org
              </span>
            )}
            {repo.license && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                {repo.license.spdx_id}
              </span>
            )}
          </div>

          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {repo.description || "（暂无项目描述）"}
          </p>

          {(starBand || isTopByStars || isHotRecent || isExactMatch) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {starBand && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700 shadow-sm ring-1 ring-orange-200 dark:from-amber-500/10 dark:to-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30"
                  title="⭐ ≥ 5k | 🌟 ≥ 50k Stars"
                >
                  {starBand} Superstar
                </span>
              )}
              {isTopByStars && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-50 to-indigo-50 px-2.5 py-1 text-[11px] font-bold text-violet-700 shadow-sm ring-1 ring-violet-200 dark:from-violet-500/10 dark:to-indigo-500/10 dark:text-violet-300 dark:ring-violet-500/30"
                  title="本页 Stars 排名前 3"
                >
                  🏆 Top Stars
                </span>
              )}
              {isHotRecent && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-pink-50 to-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 shadow-sm ring-1 ring-rose-200 dark:from-pink-500/10 dark:to-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
                  title={
                    since === "daily"
                      ? "24h 内有更新 + Stars ≥ 500"
                      : since === "monthly"
                        ? "30 天内更新 + Stars ≥ 500"
                        : "7 天内更新 + Stars ≥ 500"
                  }
                >
                  🔥 近期活跃
                </span>
              )}
              {isExactMatch && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:from-emerald-500/10 dark:to-teal-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
                  title="Name/Description/Topics 里包含你搜的关键词"
                >
                  🎯 精准命中
                </span>
              )}
            </div>
          )}

          {repo.topics && repo.topics.length > 0 && (
            <div className="mt-3 mb-1.5 flex flex-wrap gap-1.5">
              {repo.topics.slice(0, 6).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400"
                >
                  #{t}
                </span>
              ))}
              {repo.topics.length > 6 && (
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700">
                  +{repo.topics.length - 6}
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500 dark:text-zinc-500">
            {repo.language && (
              <span className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: langColor(repo.language) }}
                />
                {repo.language}
              </span>
            )}
            <span className="flex items-center gap-1" title="Stars">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
              </svg>
              {formatCount(repo.stargazers_count)}
            </span>
            <span className="flex items-center gap-1" title="Forks">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 3a3 3 0 0 1 3 3c0 1.11-.89 2-2 2a1.993 1.993 0 0 1-1-3.93A1.993 1.993 0 0 1 6 3m12 0a3 3 0 0 1 3 3c0 1.11-.89 2-2 2a1.993 1.993 0 0 1-1-3.93A1.993 1.993 0 0 1 18 3M6 14c1.11 0 2 .89 2 2 0 1.11-.89 2-2 2a1.993 1.993 0 0 1-1-3.93A1.993 1.993 0 0 1 6 14m12 0c1.11 0 2 .89 2 2 0 1.11-.89 2-2 2a1.993 1.993 0 0 1-1-3.93A1.993 1.993 0 0 1 18 14M10.8 18.9c-.5.74-1.42 1.1-2.38 1.1-1.5 0-2.72-.94-3.2-2.27.06-.11.14-.22.26-.32l5.25-2.95c-.34-.11-.73-.17-1.13-.19V9.27L5.29 12a2.99 2.99 0 0 1-1.29-2.42c0-1.03.52-1.92 1.3-2.48V5.02c-.01 0-.01.02 0 .02L12 1.7l6.7 3.34v2.08c.78.56 1.3 1.45 1.3 2.48 0 .94-.47 1.77-1.21 2.27l-5.49-2.68v4.44h.05c.44.02.88.1 1.3.25l5.06 3.07c.02.02.06.07.04.12-.42 1.2-1.66 2.04-3.05 2.04-.96 0-1.85-.4-2.38-1.08l-1.4-3.01Z" />
              </svg>
              {formatCount(repo.forks_count)}
            </span>
            {repo.open_issues_count > 0 && (
              <span className="flex items-center gap-1" title="Issues">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
                </svg>
                {formatCount(repo.open_issues_count)}
              </span>
            )}
            <span className="ml-auto">更新于 {timeAgo(repo.updated_at)}</span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => fetchSummary({ force: !!(summarize?.summary || summarize?.readmeSnippet || summarize?.error) })}
              disabled={summarize?.loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 px-3 text-xs font-medium text-white shadow-sm shadow-indigo-500/20 transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60 dark:shadow-none"
            >
              {summarize?.loading ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  生成中…
                </>
              ) : summarize?.summary ? (
                <>
                  <span>🔄</span>
                  重新生成{aiName}总结
                </>
              ) : summarize?.readmeSnippet ? (
                <>
                  <span>✨</span>
                  重试 AI 总结
                </>
              ) : summarize?.error ? (
                <>
                  <span>⚠️</span>
                  重新生成
                </>
              ) : (
                <>
                  <span>🧠</span>
                  {aiName}中文总结
                </>
              )}
            </button>
            {repo.homepage && (
              <a
                href={repo.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <span>🌐</span>官网
              </a>
            )}
            <a
              href={repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.1.79-.25.79-.56v-2c-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.68 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.77.12 3.06.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
              </svg>
              GitHub
            </a>
          </div>

          {summarize && !summarize.loading && (summarize.summary || summarize.readmeSnippet || summarize.error) && (
            <div className="mt-4 rounded-xl border border-gradient-to-br from-indigo-50 via-violet-50 to-fuchsia-50 bg-gradient-to-br from-indigo-50/40 via-violet-50/40 to-fuchsia-50/40 p-4 dark:from-indigo-500/5 dark:via-violet-500/5 dark:to-fuchsia-500/5 dark:border-indigo-500/20">
              <div className="mb-3 flex items-center gap-2">
                {summarize.mode === "ai" && summarize.summary ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <span>✨</span> {aiName} AI 中文总结
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    <span>📄</span> README 摘要
                    <span className="text-zinc-500 dark:text-zinc-400">（AI 失败兜底）</span>
                  </span>
                )}
              </div>
              {summarize.error && !summarize.summary && !summarize.readmeSnippet ? (
                <p className="text-sm text-red-500">{summarize.error}</p>
              ) : (
                <SummaryView text={(summarize.summary || summarize.readmeSnippet || "（暂无内容）")} mode={summarize.mode} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

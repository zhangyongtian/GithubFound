import Link from "next/link";
import { Suspense } from "react";
import { Metadata } from "next";
import { searchRepos } from "@/lib/github";
import { formatCount } from "@/lib/utils";
import RepoCard from "@/components/RepoCard";
import FilterBar from "@/components/FilterBar";

export const metadata: Metadata = {
  title: "分类搜索 · GithubFound",
  description: "通过关键词、编程语言、主题分类，精确搜索 GitHub 项目并获得 AI 中文总结。",
};

export const revalidate = 600;

type SearchParams = Promise<{
  query?: string;
  orig_query?: string;
  rw_exp?: string;
  language?: string;
  topic?: string;
  sort?: string;
  order?: string;
  since?: "daily" | "weekly" | "monthly";
  page?: string;
}>;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const query = sp.query || undefined;
  const origQuery = sp.orig_query || undefined;
  const rwExp = sp.rw_exp || undefined;
  const language = sp.language || undefined;
  const topic = sp.topic || undefined;
  const sort =
    (sp.sort as "stars" | "forks" | "updated" | "help-wanted-issues") ||
    "stars";
  const order = (sp.order as "desc" | "asc") || "desc";
  const since = (sp.since as "daily" | "weekly" | "monthly") || "daily";
  const page = Math.max(Number(sp.page || 1), 1);
  const perPage = 21;

  let result: {
    items: Awaited<ReturnType<typeof searchRepos>>["items"];
    total_count: number;
    success: boolean;
    error?: string;
  };

  try {
    const r = await searchRepos({
      query,
      language,
      topic,
      sort,
      order,
      since,
      perPage,
      page,
    });
    result = { ...r, success: true };
  } catch (e) {
    result = {
      items: [],
      total_count: 0,
      success: false,
      error: e instanceof Error ? e.message : "获取失败",
    };
  }

  const totalStars = result.items.reduce((s, r) => s + r.stargazers_count, 0);

  const activeFilters: { label: string; value: string; color: string }[] = [];
  if (query) activeFilters.push({ label: "关键词", value: `"${query}"`, color: "indigo" });
  if (language) activeFilters.push({ label: "语言", value: language, color: "zinc" });
  if (topic) activeFilters.push({ label: "分类", value: topic, color: "violet" });
  if (since) activeFilters.push({ label: "时间", value: since, color: "orange" });
  const sortLabel: Record<string, string> = {
    stars: "Stars最多",
    forks: "Forks最多",
    updated: "最近更新",
    "help-wanted-issues": "求贡献",
  };
  if (sort) activeFilters.push({ label: "排序", value: sortLabel[sort] || sort, color: "emerald" });

  function isMatchTag(repo: (typeof result.items)[number], tokens: string[]): boolean {
    if (!tokens.length) return false;
    const hay = [
      repo.name,
      repo.full_name,
      repo.description || "",
      ...(repo.topics || []),
    ]
      .join(" ")
      .toLowerCase();
    return tokens.some((t) => t.length >= 2 && hay.includes(t.toLowerCase()));
  }
  function isHotRecent(repo: (typeof result.items)[number], sinceKey: "daily" | "weekly" | "monthly"): boolean {
    if (!repo.updated_at) return false;
    const days: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
    const cutoff = Date.now() - days[sinceKey] * 24 * 3600 * 1000;
    return repo.stargazers_count >= 500 && new Date(repo.updated_at).getTime() >= cutoff;
  }
  function isTopStars(repo: (typeof result.items)[number]): boolean {
    if (!result.items.length) return false;
    const sortedStars = [...result.items].map((x) => x.stargazers_count).sort((a, b) => b - a);
    const threshold = sortedStars[Math.min(2, sortedStars.length - 1)] ?? 0;
    const globalThreshold = 0.0003;
    return (
      repo.stargazers_count >= threshold ||
      repo.stargazers_count >= 8000 ||
      (result.total_count > 0 && repo.stargazers_count / result.total_count >= globalThreshold)
    );
  }
  function getStarBand(stars: number): { label: string; className: string; bonus: number } {
    if (stars >= 50000) return { label: "🌟 Superstar", className: "bg-gradient-to-r from-orange-500 to-amber-500", bonus: 1.1 };
    if (stars >= 5000) return { label: "⭐ 5k+", className: "bg-gradient-to-r from-amber-500 to-yellow-500", bonus: 1.05 };
    if (stars >= 1000) return { label: "⭐ 1k+", className: "bg-gradient-to-r from-yellow-500 to-lime-500", bonus: 1.02 };
    return { label: "", className: "", bonus: 1 };
  }
  const tokens = (query || "").split(/\s+|[，,。.！!？?、/\\()（）\[\]【】'"\"`~:：;；|]|#/).filter(Boolean);
  const maxStars = Math.max(...result.items.map((r) => r.stargazers_count), 1);
  let rankedItems = [...result.items].map((repo, idx) => {
    const match = isMatchTag(repo, tokens);
    const hot = isHotRecent(repo, since);
    const top = isTopStars(repo);
    const band = getStarBand(repo.stargazers_count);
    const starsNorm = Math.max(0.05, repo.stargazers_count / maxStars);
    const rankScore =
      (match ? 2.0 : 1) *
      (hot ? 1.5 : 1) *
      (top ? 1.2 : 1) *
      band.bonus *
      Math.pow(starsNorm, 0.55) *
      Math.max(0.4, 1 - idx * 0.005);
    return { repo, rankScore, match, hot, top, band };
  });
  rankedItems.sort((a, b) => b.rankScore - a.rankScore);
  const hasRanked = result.items.length > 0 && query !== undefined;

  return (
    <div className="space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-6 text-white shadow-xl sm:p-8">
          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">
            🧭 精准搜索 GitHub 项目
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
            支持关键词、编程语言、主题标签多维筛选，
            点击项目卡片的 <b className="text-white">「中文总结」</b> 让 AI 帮你解读。
          </p>
          {result.success && (
                <div className="mt-5 flex flex-wrap gap-4 text-xs text-white/80 sm:text-sm">
                  <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                    <span>🎯</span> 匹配{" "}
                    <b className="text-white">{formatCount(result.total_count)}</b> 个项目
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                    <span>📦</span> 本页 <b className="text-white">{result.items.length}</b> 个
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                    <span>⭐</span> 合计{" "}
                    <b className="text-white">{formatCount(totalStars)}</b> Stars
                  </div>
                </div>
              )}
        </section>

        <Suspense>
          <section className="mb-6">
            <FilterBar mode="search" />
          </section>
        </Suspense>

        <section id="result-list">
          {!result.success ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-500/10">
              <div className="text-3xl">⚠️</div>
              <h3 className="mt-2 text-base font-bold text-red-700 dark:text-red-300">
                请求失败
              </h3>
              <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
                {result.error}
              </p>
            </div>
          ) : result.items.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
              <div className="text-4xl">🔍</div>
              <h3 className="mt-3 text-lg font-bold text-zinc-800 dark:text-zinc-100">
                没有匹配到项目
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                试试换个关键词、放宽语言或分类条件
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    🎯 搜索结果
                  </h2>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                    共 {formatCount(result.total_count)} 个
                  </span>
                  {hasRanked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/60 dark:from-amber-500/10 dark:to-orange-500/10 dark:text-amber-300 dark:ring-amber-500/20">
                      <span>🎖</span> 综合推荐排序
                    </span>
                  )}
                  {activeFilters.map((f, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        f.color === "indigo"
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                          : f.color === "violet"
                          ? "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                          : f.color === "orange"
                          ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                          : f.color === "emerald"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      <span className="opacity-60">{f.label}:</span> {f.value}
                    </span>
                  ))}
                </div>
                <span className="text-[11px] text-zinc-400">
                  本页 Stars 合计 ⭐ {formatCount(totalStars)}
                </span>
              </div>

              <div className="grid gap-3 sm:gap-4">
                {rankedItems.map((entry, i) => (
                  <RepoCard
                    key={entry.repo.id}
                    repo={entry.repo}
                    index={(page - 1) * perPage + i}
                    totalStars={totalStars}
                    items={result.items}
                    since={since}
                    origQuery={query}
                  />
                ))}
              </div>

              <div className="mt-10 flex items-center justify-center">
                <div className="inline-flex h-12 items-center gap-1 rounded-2xl border border-emerald-100 bg-white p-1.5 shadow-sm dark:border-emerald-500/20 dark:bg-zinc-900/60">
                  {page > 1 ? (
                    <Link
                      href={buildSearchUrl({ ...sp, page: String(page - 1) })}
                      scroll={false}
                      className="group inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-zinc-700 transition-all hover:bg-emerald-50 dark:text-zinc-300 dark:hover:bg-emerald-500/10"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 transition-colors group-hover:bg-white group-hover:text-emerald-600 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-900 dark:group-hover:text-emerald-400">
                        ←
                      </span>
                      上一页
                    </Link>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-zinc-300 dark:text-zinc-600" aria-disabled>
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600">
                        ←
                      </span>
                      上一页
                    </span>
                  )}

                  <span className="mx-1 inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-4 text-sm font-extrabold text-zinc-800 ring-1 ring-emerald-100 dark:from-emerald-500/10 dark:via-zinc-900/40 dark:to-teal-500/10 dark:text-zinc-100 dark:ring-emerald-500/20">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-black text-white">
                      {page}
                    </span>
                    第 {page} 页
                  </span>

                  {result.items.length >= perPage ? (
                    <Link
                      href={buildSearchUrl({ ...sp, page: String(page + 1) })}
                      scroll={false}
                      className="group inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 px-4 text-sm font-extrabold text-white shadow-md shadow-emerald-500/20 transition-all hover:brightness-110 active:brightness-95"
                    >
                      下一页
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/15 backdrop-blur-sm transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                    </Link>
                  ) : (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-100 px-4 text-sm font-extrabold text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600" aria-disabled>
                      已到底
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-zinc-200/70 text-zinc-400 dark:bg-zinc-700 dark:text-zinc-500">
                        ✓
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    );
  }

function buildSearchUrl(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/search?${qs}` : "/search";
}

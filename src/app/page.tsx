import Link from "next/link";
import { Suspense } from "react";
import { Metadata } from "next";
import { getTrendingRepos } from "@/lib/github";
import { formatCount } from "@/lib/utils";
import RepoCard from "@/components/RepoCard";
import FilterBar from "@/components/FilterBar";

export const metadata: Metadata = {
  title: "GitHub 热门项目发现 · GithubFound",
  description:
    "发现 GitHub 每日/每周/每月热门项目，按语言和分类筛选，AI 中文总结帮你快速理解项目用途。",
};

export const revalidate = 900;

type SearchParams = Promise<{
  language?: string;
  topic?: string;
  sort?: string;
  since?: "daily" | "weekly" | "monthly";
  page?: string;
}>;

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const language = sp.language || undefined;
  const topic = sp.topic || undefined;
  const sort = (sp.sort as "stars" | "forks" | "updated") || "stars";
  const since = (sp.since as "daily" | "weekly" | "monthly") || "daily";
  const page = Math.max(Number(sp.page || 1), 1);
  const perPage = 21;

  let result: {
    items: Awaited<ReturnType<typeof getTrendingRepos>>["items"];
    total_count: number;
    success: boolean;
    error?: string;
  };

  try {
    const r = await getTrendingRepos({
      language,
      topic,
      sort,
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
  const topLang = result.items.filter((x) => x.language).slice(0, 3);

  function isHotRecent(
    repo: Awaited<ReturnType<typeof getTrendingRepos>>["items"][number],
    sinceKey: "daily" | "weekly" | "monthly",
  ): boolean {
    if (!repo.updated_at) return false;
    const days: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
    const cutoff = Date.now() - days[sinceKey] * 24 * 3600 * 1000;
    return repo.stargazers_count >= 500 && new Date(repo.updated_at).getTime() >= cutoff;
  }
  function isTopStars(
    repo: Awaited<ReturnType<typeof getTrendingRepos>>["items"][number],
  ): boolean {
    if (!result.items.length) return false;
    const sortedStars = [...result.items].map((x) => x.stargazers_count).sort((a, b) => b - a);
    const threshold = sortedStars[Math.min(2, sortedStars.length - 1)] ?? 0;
    return repo.stargazers_count >= threshold || repo.stargazers_count >= 8000;
  }
  function getStarBand(stars: number): { label: string; className: string; bonus: number } {
    if (stars >= 50000) return { label: "🌟 Superstar", className: "bg-gradient-to-r from-orange-500 to-amber-500", bonus: 1.1 };
    if (stars >= 5000) return { label: "⭐ 5k+", className: "bg-gradient-to-r from-amber-500 to-yellow-500", bonus: 1.05 };
    if (stars >= 1000) return { label: "⭐ 1k+", className: "bg-gradient-to-r from-yellow-500 to-lime-500", bonus: 1.02 };
    return { label: "", className: "", bonus: 1 };
  }
  const maxStars = Math.max(...result.items.map((r) => r.stargazers_count), 1);
  const rankedItems = [...result.items].map((repo, idx) => {
    const hot = isHotRecent(repo, since);
    const top = isTopStars(repo);
    const band = getStarBand(repo.stargazers_count);
    const starsNorm = Math.max(0.05, repo.stargazers_count / maxStars);
    const rankScore =
      (hot ? 1.5 : 1) * (top ? 1.2 : 1) * band.bonus * Math.pow(starsNorm, 0.55) * Math.max(0.5, 1 - idx * 0.006);
    return { repo, rankScore, hot, top, band };
  });
  rankedItems.sort((a, b) => b.rankScore - a.rankScore);
  const hasRanked = result.items.length > 0;

  const activeFilters: { label: string; value: string; color: string }[] = [];
  if (language) activeFilters.push({ label: "语言", value: language, color: "zinc" });
  if (topic) activeFilters.push({ label: "分类", value: topic, color: "violet" });
  const sinceLabel: Record<string, string> = { daily: "今日", weekly: "本周", monthly: "本月" };
  activeFilters.push({ label: "热门", value: sinceLabel[since] || since, color: "orange" });
  const sortLabel: Record<string, string> = {
    stars: "Stars最多",
    forks: "Forks最多",
    updated: "最近更新",
    "help-wanted-issues": "求贡献",
  };
  if (sort) activeFilters.push({ label: "排序", value: sortLabel[sort] || sort, color: "emerald" });

  return (
    <div className="space-y-6">
        <section className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 p-6 text-white shadow-xl sm:p-8">
          <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">
            🚀 发现 GitHub 最值得关注的开源项目
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">
            每日/每周/每月热门趋势，支持 25+ 编程语言与 20+ 主题分类筛选，
            点击项目卡片即可生成 <b className="text-white">AI 中文总结</b>，一眼看懂项目价值。
          </p>
          {result.success && result.items.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-4 text-xs text-white/80 sm:text-sm">
              <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                <span>📦</span> 当前页 <b className="text-white">{result.items.length}</b> 个
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                <span>⭐</span> 合计{" "}
                <b className="text-white">{formatCount(totalStars)}</b> Stars
              </div>
              {topLang[0]?.language && (
                <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                  <span>🏆</span> 热门语言 <b className="text-white">{topLang[0].language}</b>
                </div>
              )}
            </div>
          )}
        </section>

        <Suspense fallback={null}>
          <FilterBar mode="trending" />
        </Suspense>

        <section id="result-list" className="space-y-3">
          {!result.success ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-500/10">
              <div className="text-3xl">⚠️</div>
              <h3 className="mt-2 text-base font-bold text-red-700 dark:text-red-300">
                GitHub API 请求失败
              </h3>
              <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
                {result.error || "可能触发了速率限制（未配置 GITHUB_TOKEN 时 60次/小时）"}
              </p>
              <p className="mt-3 text-xs text-red-600/60 dark:text-red-400/60">
                配置 <code className="rounded bg-red-100 px-1.5 py-0.5 dark:bg-red-900/40">GITHUB_TOKEN</code>{" "}
                可提升到 5000次/小时，参考{" "}
                <code className="rounded bg-red-100 px-1.5 py-0.5 dark:bg-red-900/40">.env.example</code>
              </p>
            </div>
          ) : result.items.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
              <div className="text-4xl">🔍</div>
              <h3 className="mt-3 text-lg font-bold text-zinc-800 dark:text-zinc-100">
                暂无匹配结果
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                试试调整语言、分类或时间范围吧～
              </p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    🎯 热门项目
                  </h2>
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
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
                        f.color === "violet"
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
                  {topLang[0]?.language && ` · 🏆 ${topLang[0].language}`}
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
                    origQuery=""
                  />
                ))}
              </div>

              <div className="mt-10 flex items-center justify-center">
                <div className="inline-flex h-12 items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
                  {page > 1 ? (
                    <Link
                      href={buildUrl({ ...sp, page: String(page - 1) })}
                      scroll={false}
                      className="group inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 transition-colors group-hover:bg-white group-hover:text-indigo-600 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-900 dark:group-hover:text-indigo-400">
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

                  <span className="mx-1 inline-flex h-9 items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-4 text-sm font-extrabold text-zinc-800 ring-1 ring-indigo-100 dark:from-indigo-500/10 dark:via-zinc-900/40 dark:to-violet-500/10 dark:text-zinc-100 dark:ring-indigo-500/20">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-md bg-indigo-600 text-[10px] font-black text-white">
                      {page}
                    </span>
                    第 {page} 页
                  </span>

                  {result.items.length >= perPage ? (
                    <Link
                      href={buildUrl({ ...sp, page: String(page + 1) })}
                      scroll={false}
                      className="group inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-4 text-sm font-extrabold text-white shadow-md shadow-indigo-500/20 transition-all hover:brightness-110 active:brightness-95"
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

function buildUrl(params: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}

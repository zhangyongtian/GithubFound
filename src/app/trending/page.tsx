import { Suspense } from "react";
import { Metadata } from "next";
import { getTrendingRepos } from "@/lib/github";
import { formatCount } from "@/lib/utils";
import TrendingInsightCard from "@/components/TrendingInsightCard";
import RepoCard from "@/components/RepoCard";

export const metadata: Metadata = {
  title: "GitHub 开源风向标 · GithubFound",
  description:
    "AI 提炼 GitHub 最近热门技术方向、飙升榜 Top、热门编程语言 / Topics，快速把握技术脉搏。",
};

export const revalidate = 900;

type SearchParams = Promise<{
  language?: string;
  topic?: string;
  sort?: string;
  since?: "daily" | "weekly" | "monthly";
  page?: string;
  scope?: "trending" | "search";
}>;

export default async function TrendingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const language = sp.language || undefined;
  const topic = sp.topic || undefined;
  const sort = (sp.sort as "stars" | "forks" | "updated") || "stars";
  const since = (sp.since as "daily" | "weekly" | "monthly") || "daily";
  const scope = (sp.scope as "trending" | "search") || "trending";
  const perPage = 10;
  const page = 1;

  let trending: Awaited<ReturnType<typeof getTrendingRepos>> | null = null;
  let errorMsg: string | null = null;

  try {
    trending = await getTrendingRepos({
      since,
      language,
      topic,
      sort,
      order: "desc",
      page,
      perPage,
    });
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "拉取热门项目失败";
  }

  const SINCE_LABEL: Record<string, string> = {
    daily: "近 24 小时",
    weekly: "近 7 天",
    monthly: "近 30 天",
  };
  const SORT_LABEL: Record<string, string> = {
    stars: "Stars 最多",
    forks: "Forks 最多",
    updated: "最近更新",
    "help-wanted-issues": "求贡献",
  };

  function isHotRecent(
    repo: NonNullable<typeof trending>["items"][number],
    sinceKey: "daily" | "weekly" | "monthly",
  ): boolean {
    if (!repo.updated_at) return false;
    const days: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
    const cutoff = Date.now() - days[sinceKey] * 24 * 3600 * 1000;
    return repo.stargazers_count >= 500 && new Date(repo.updated_at).getTime() >= cutoff;
  }
  function isTopStars(
    repo: NonNullable<typeof trending>["items"][number],
    items: NonNullable<typeof trending>["items"],
  ): boolean {
    if (!items.length) return false;
    const sortedStars = [...items].map((x) => x.stargazers_count).sort((a, b) => b - a);
    const threshold = sortedStars[Math.min(2, sortedStars.length - 1)] ?? 0;
    return repo.stargazers_count >= threshold || repo.stargazers_count >= 8000;
  }
  function getStarBand(stars: number): { label: string; className: string; bonus: number } {
    if (stars >= 50000) return { label: "🌟 Superstar", className: "bg-gradient-to-r from-orange-500 to-amber-500", bonus: 1.1 };
    if (stars >= 5000) return { label: "⭐ 5k+", className: "bg-gradient-to-r from-amber-500 to-yellow-500", bonus: 1.05 };
    if (stars >= 1000) return { label: "⭐ 1k+", className: "bg-gradient-to-r from-yellow-500 to-lime-500", bonus: 1.02 };
    return { label: "", className: "", bonus: 1 };
  }
  const items = trending?.items || [];
  const totalStars = items.reduce((s, r) => s + r.stargazers_count, 0);
  const maxStars = Math.max(...items.map((r) => r.stargazers_count), 1);
  const rankedItems = [...items].map((repo, idx) => {
    const hot = isHotRecent(repo, since);
    const top = isTopStars(repo, items);
    const band = getStarBand(repo.stargazers_count);
    const starsNorm = Math.max(0.05, repo.stargazers_count / maxStars);
    const rankScore =
      (hot ? 1.5 : 1) * (top ? 1.2 : 1) * band.bonus * Math.pow(starsNorm, 0.55) * Math.max(0.5, 1 - idx * 0.006);
    return { repo, rankScore, hot, top, band };
  });
  rankedItems.sort((a, b) => b.rankScore - a.rankScore);
  const total = trending?.total_count || 0;

  const buildQS = (over: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (language) next.set("language", language);
    if (topic) next.set("topic", topic);
    if (sort) next.set("sort", sort);
    if (since) next.set("since", since);
    if (scope) next.set("scope", scope);
    for (const [k, v] of Object.entries(over)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    return next.toString();
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-indigo-50 via-white to-fuchsia-50 shadow-sm dark:border-zinc-800 dark:from-indigo-500/10 dark:via-zinc-900/30 dark:to-fuchsia-500/10">
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-fuchsia-600/95 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm shadow-fuchsia-900/20">
                🧭 开源风向标
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
                最近 GitHub 都在流行什么？
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                综合
                <span className="mx-1 font-semibold text-fuchsia-700 dark:text-fuchsia-300">{SINCE_LABEL[since]}</span>
                的 {trending ? formatCount(trending.total_count) : "—"} 个热门项目，
                AI 提炼 <span className="font-semibold text-indigo-700 dark:text-indigo-300">技术方向</span> +
                <span className="font-semibold text-orange-700 dark:text-orange-300"> 飙升榜 Top</span> +
                <span className="font-semibold text-emerald-700 dark:text-emerald-300"> 热门语言 / Topics</span>，
                让你最快把握最近的开源脉搏。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                📦 样本 {items.length}
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20">
                ⭐ Stars 总计 {formatCount(totalStars)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <Suspense
        fallback={
          <div className="h-96 animate-pulse space-y-4">
            <div className="h-5 w-1/3 rounded-full bg-zinc-200" />
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
              <div className="h-96 rounded-3xl bg-zinc-100" />
              <div className="h-96 rounded-3xl bg-zinc-100" />
            </div>
          </div>
        }
      >
        <TrendingInsightCard
          initialSince={since}
          scope={scope}
          language={language}
          topic={topic}
          sort={sort}
        />
      </Suspense>

      <section className="space-y-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              📚 {SINCE_LABEL[since]} 综合热度 Top 10
            </h2>
            <span className="rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-[11px] font-medium text-fuchsia-700 dark:bg-fuchsia-500/10 dark:text-fuchsia-300">
              共 {formatCount(total)} 个
            </span>
            {rankedItems.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/60 dark:from-amber-500/10 dark:to-orange-500/10 dark:text-amber-300 dark:ring-amber-500/20">
                🎖 综合推荐排序
              </span>
            )}
          </div>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            显示前 10
          </span>
        </div>

        {errorMsg && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            ⚠ {errorMsg}
          </div>
        )}

        <div className="grid gap-3 sm:gap-4">
          {rankedItems.map((entry, i) => (
            <RepoCard
              key={entry.repo.id}
              repo={entry.repo}
              index={i}
              totalStars={totalStars}
              items={items}
              since={since}
              origQuery=""
            />
          ))}
          {rankedItems.length === 0 && !errorMsg && (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-400">
              当前筛选条件下没有匹配到项目，换个条件试试 🐣
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

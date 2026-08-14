import { NextRequest } from "next/server";
import { getTrendingRepos } from "@/lib/github";
import { isAIEnabled, askLLM, detectProvider } from "@/lib/llm";
import { withCache, deleteCache } from "@/lib/cache";
import type { GithubRepo, SINCE_VALUES, SORT_VALUES } from "@/lib/types";
import { applyReqSettings } from "@/lib/applyReqSettings";
import crypto from "node:crypto";

export const runtime = "nodejs";

type RepoSlim = Pick<GithubRepo, "full_name" | "description" | "stargazers_count" | "language" | "topics" | "html_url" | "updated_at" | "id">;
type TopMover = {
  rank: number;
  weeklyStarsRank: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  velocity_delta: number;
};

export async function GET(request: NextRequest) {
  try {
    applyReqSettings(request);
    const sp = request.nextUrl.searchParams;
    const sinceRaw = (sp.get("since") as SINCE_VALUES | null) || "daily";
    const since: SINCE_VALUES =
      sinceRaw === "daily" || sinceRaw === "weekly" || sinceRaw === "monthly"
        ? sinceRaw
        : "weekly";
    const language = sp.get("language");
    const topic = sp.get("topic");
    const sort = sp.get("sort") || "stars";
    const perPage = 50;
    const revalidate = sp.get("revalidate") !== null;

    const freshMeta = (() => {
      let provider: string | undefined;
      let model: string | undefined;
      let displayName = "AI";
      try {
        if (isAIEnabled()) {
          const cfg = detectProvider();
          provider = cfg.provider === "none" ? undefined : cfg.provider;
          model = cfg.model || undefined;
          const p = (cfg.provider || "ai").toLowerCase();
          displayName = p.includes("agnes")
            ? "Agnes"
            : p.includes("dashscope")
              ? "千问"
              : p.includes("deepseek")
                ? "DeepSeek"
                : p.includes("openai")
                  ? "GPT"
                  : p.includes("anthropic")
                    ? "Claude"
                    : p.includes("google")
                      ? "Gemini"
                      : p.includes("openrouter")
                        ? "OpenRouter"
                        : cfg.provider || "AI";
        }
      } catch {
        displayName = "AI";
      }
      return { provider, model, displayName };
    })();

    const llmSig = (() => {
      try {
        const cfg = isAIEnabled() ? detectProvider() : null;
        if (!cfg || cfg.provider === "none") return "none";
        const hashedKey = cfg.apiKey
          ? crypto.createHash("sha256").update(cfg.apiKey.slice(0, 48)).digest("hex").slice(0, 10)
          : "nokey";
        return `${cfg.provider}:${(cfg.model || "default").replace(/[^A-Za-z0-9._-]/g, "_")}:${hashedKey}`;
      } catch {
        return "none";
      }
    })();

    const cacheKey = `trending_insight:v12:${since}:${language || ""}:${topic || ""}:${sort}:${perPage}:${llmSig}`;
    if (revalidate) {
      deleteCache(cacheKey);
    }

    const cached = await withCache(cacheKey, 86400 / 2, async () => {
      const langCount: Record<string, number> = {};
      const topicCount: Record<string, number> = {};
      const slim: RepoSlim[] = [];
      const dailySlim: RepoSlim[] = [];
      const weeklySlim: RepoSlim[] = [];
      let trendingError: string | null = null;
      let aiError: string | null = null;

      async function pullSince(targetSince: SINCE_VALUES) {
        try {
          const result = await getTrendingRepos({
          since: targetSince,
          language: language || undefined,
          topic: topic || undefined,
          sort: (sort as SORT_VALUES) || "stars",
          order: "desc",
          page: 1,
          perPage: 50,
        });
          const list: RepoSlim[] = [];
          for (const r of result?.items || []) {
            list.push({
              id: r.id,
              full_name: r.full_name,
              description: r.description,
              stargazers_count: r.stargazers_count,
              language: r.language,
              topics: r.topics,
              html_url: r.html_url,
              updated_at: r.updated_at,
            });
          }
          return list;
        } catch {
          return [] as RepoSlim[];
        }
      }

      try {
        const [main, daily, weekly] = await Promise.all([
          pullSince(since),
          pullSince("daily"),
          pullSince("weekly"),
        ]);
        for (const r of main) {
          slim.push(r);
          if (r.language) langCount[r.language] = (langCount[r.language] || 0) + 1;
          for (const t of r.topics || []) topicCount[t] = (topicCount[t] || 0) + 1;
        }
        for (const r of daily) dailySlim.push(r);
        for (const r of weekly) weeklySlim.push(r);
        if (slim.length === 0 && dailySlim.length > 0) {
          for (const r of dailySlim) slim.push(r);
        }
      } catch (e) {
        trendingError = e instanceof Error ? e.message : "trending 拉取失败";
      }

      const dailyIdx = new Map<string, number>();
      dailySlim.forEach((r, i) => dailyIdx.set(r.full_name, i));
      const weeklyIdx = new Map<string, number>();
      weeklySlim.forEach((r, i) => weeklyIdx.set(r.full_name, i));
      const seen = new Set<string>();
      const candidate: Omit<TopMover, "rank">[] = [];
      for (let i = 0; i < weeklySlim.length; i++) {
        const repo = weeklySlim[i];
        if (!repo) continue;
        if (seen.has(repo.full_name)) continue;
        seen.add(repo.full_name);
        const di = dailyIdx.get(repo.full_name);
        const wi = weeklyIdx.get(repo.full_name);
        let velocityDelta = 0;
        if (di !== undefined && wi !== undefined) {
          velocityDelta = wi - di;
        } else if (di === undefined && wi !== undefined) {
          velocityDelta = Math.max(5, 50 - wi);
        }
        candidate.push({
          weeklyStarsRank: i + 1,
          full_name: repo.full_name,
          html_url: repo.html_url,
          description: repo.description,
          stargazers_count: repo.stargazers_count,
          language: repo.language,
          velocity_delta: velocityDelta,
        });
      }
      for (let i = 0; i < dailySlim.length; i++) {
        const repo = dailySlim[i];
        if (!repo) continue;
        if (seen.has(repo.full_name)) continue;
        seen.add(repo.full_name);
        const di = dailyIdx.get(repo.full_name)!;
        const wi = weeklyIdx.get(repo.full_name);
        let velocityDelta = 0;
        if (wi !== undefined) {
          velocityDelta = wi - di;
        } else {
          velocityDelta = Math.max(5, 50 - di);
        }
        candidate.push({
          weeklyStarsRank: wi !== undefined ? wi + 1 : 0,
          full_name: repo.full_name,
          html_url: repo.html_url,
          description: repo.description,
          stargazers_count: repo.stargazers_count,
          language: repo.language,
          velocity_delta: velocityDelta,
        });
      }
      const topMovers: TopMover[] = candidate
        .sort((a, b) => {
          const d = b.velocity_delta - a.velocity_delta;
          if (d !== 0) return d;
          return b.stargazers_count - a.stargazers_count;
        })
        .slice(0, 3)
        .map((m, i) => ({ ...m, rank: i + 1 }));


      const topLangs = Object.entries(langCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      const topTopics = Object.entries(topicCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      if (slim.length === 0) {
        return {
          success: false as const,
          error: trendingError || "未拉到热门项目",
          mode: "fallback" as const,
          insight: "",
          topLangs,
          topTopics,
          sampleCount: 0,
          since,
          topMovers,
          trendingError,
        };
      }

      let insight = "";
      let mode: "ai" | "fallback" = "fallback";

      if (isAIEnabled()) {
        const sinceLabel: Record<string, string> = {
          daily: "最近 24 小时",
          weekly: "最近一周",
          monthly: "最近一个月",
        };

        const topRepos = slim
          .slice(0, 20)
          .map(
            (r) =>
              `- ${r.full_name} (stars:${r.stargazers_count}) ${r.language ? `lang:${r.language}` : ""}: ${r.description || "(无描述)"}`
          )
          .join("\n");

        const velocityLines = topMovers.slice(0, 5).map(
          (m) => `- [代表项目] ${m.full_name} ⭐${m.stargazers_count}（周榜第${m.weeklyStarsRank || "未上榜"}，今日名次提升${m.velocity_delta}）`
        );

        const userPrompt = `你是一位 GitHub 开源生态观察员，负责对"所有提供的热门项目"做整体趋势归纳，而不是只挑 4 个项目举例。

请根据下面 ${sinceLabel[since]} 的 GitHub 热门项目（共 ${slim.length} 个），用中文总结整体技术趋势风向标。严格按下面的 Markdown 结构输出：

## 总体判断
（一句话宏观结论：基于这 ${slim.length} 个项目作为一个整体，最近大家都在扎堆什么范式/需求/语言生态？不要空泛，要带结论感。）

## 趋势榜
1. 【XX 方向】
   代表项目：owner/repo ⭐xx, owner/repo ⭐xx, owner/repo ⭐xx（每行至少引用 2-4 个项目，都必须是上面【代表项目清单】里真实出现过的）
   为什么火：（1-2 句，讲清这类项目为什么集体上榜 —— 背后的需求变化 / 技术突破 / 生态成熟度，而不是单个项目本身的功能介绍。）
2. 【YY 方向】
   代表项目：owner/repo ⭐xx, owner/repo ⭐xx
   为什么火：…
（趋势榜请输出 3-8 条，按需不要固定条数；本次不要固定输出 4 条，可以 5/6/7 条。）

## 开发者建议
（1-3 条短结论告诉开发者值得花时间投入的方向/能力，每条 25 字以内，基于"整体榜单的占比和增长"而不是单个项目。）

要求：
- 每个趋势榜条目至少引用 2 个以上代表项目，用中文全角逗号"，"或英文逗号分隔，不要在同一行里重复"代表项目："字样。
- 每个趋势的"为什么火"是"这一类项目整体上榜的原因/背后的市场/技术变化"，不要只复述单个项目的功能。
- 总字数控制在 450-700 字。
- 不要输出"好的/下面是/总结/先说明"之类的客套话。
- 只输出上述三段 Markdown，不要多余段落。

【热门统计】
• 热门编程语言 Top 5：${topLangs.slice(0, 5).map(([k, v]) => `${k}(${v})`).join("， ") || "（无）"}
• 热门 Topics Top 15：${topTopics.slice(0, 15).map(([k, v]) => `#${k}(${v})`).join("， ") || "（无）"}

【飙升榜（周榜 vs 日榜名次提升）】
${velocityLines.length > 0 ? velocityLines.join("\n") : "（暂无数据）"}

【代表项目清单（请整体分析，不要挑 4 个就结束）】
${topRepos}
`;

        const ai = await (async () => {
          try {
            return await askLLM(
              userPrompt,
              "你是一位 GitHub 开源趋势观察员，资深中文技术分析师，擅长从热门项目提炼趋势，回答简洁、干货、不空泛。每个趋势方向必须引用具体代表项目：owner/repo ⭐xx。",
              2500,
              0.3
            );
          } catch (e) {
            aiError = e instanceof Error ? e.message : "AI 调用失败";
            return { text: "", ok: false };
          }
        })();
        if (ai.text) {
          insight = ai.text;
          mode = "ai";
        }
      }

      return {
        success: true as const,
        mode,
        insight,
        topLangs,
        topTopics,
        sampleCount: slim.length,
        since,
        topMovers,
        trendingError,
        aiError,
      };
    });

    const data = {
      ...cached,
      provider: freshMeta.provider ?? (cached as any).provider,
      model: freshMeta.model ?? (cached as any).model,
      displayName: freshMeta.displayName ?? (cached as any).displayName ?? "AI",
    };

    return Response.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return Response.json(
      { success: false, error: msg, mode: "fallback", insight: "", topLangs: [], topTopics: [], sampleCount: 0, since: "weekly" },
      { status: 500 }
    );
  }
}

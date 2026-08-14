import { NextRequest } from "next/server";
import { getTrendingRepos } from "@/lib/github";
import { isAIEnabled, askLLM } from "@/lib/llm";
import { withCache, deleteCache } from "@/lib/cache";
import { applyReqSettings } from "@/lib/applyReqSettings";
import type { SINCE_VALUES } from "@/lib/types";

export const runtime = "nodejs";

type HotSuggestion = {
  label: string;
  emoji: string;
  recommendedQuery: string;
  sampleRepo?: string;
  sampleStars?: number;
  count: number;
  topics: string[];
};

const FALLBACK: HotSuggestion[] = [
  { label: "Claude Agent", emoji: "🤖", recommendedQuery: "claude agent", count: 0, topics: ["agent", "claude"], sampleRepo: "anthropics/courses" },
  { label: "YOLO 目标检测", emoji: "🚀", recommendedQuery: "yolov", count: 0, topics: ["yolov8", "object-detection"], sampleRepo: "ultralytics/ultralytics" },
  { label: "LLM 推理框架", emoji: "🧠", recommendedQuery: "llm inference framework", count: 0, topics: ["llm", "inference"] },
  { label: "前端 UI 组件库", emoji: "🎨", recommendedQuery: "ui components react", count: 0, topics: ["ui", "components", "react"] },
  { label: "开发工具 CLI", emoji: "🛠", recommendedQuery: "developer tools cli", count: 0, topics: ["cli", "devtools"] },
  { label: "Rust 高性能项目", emoji: "🦀", recommendedQuery: "rust high performance", count: 0, topics: ["rust", "high-performance"] },
  { label: "RAG / 知识库", emoji: "📚", recommendedQuery: "rag knowledge base", count: 0, topics: ["rag", "vector"] },
];

function parseSuggestions(raw: string, topicCount: Record<string, number>, topRepos: Array<{ full_name: string; stargazers_count: number; topics?: string[] }>): HotSuggestion[] {
  const text = raw.trim();
  if (!text) return [];

  const pickRepoFor = (topics: string[]): { repo?: string; stars?: number } => {
    for (const r of topRepos) {
      const hits = (r.topics || []).filter((t) => topics.includes(t.toLowerCase())).length;
      if (hits > 0) return { repo: r.full_name, stars: r.stargazers_count };
    }
    const fallback = topRepos[0];
    if (fallback) return { repo: fallback.full_name, stars: fallback.stargazers_count };
    return {};
  };

  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]) as any[];
      if (Array.isArray(parsed)) {
        return parsed
          .map((x, i): HotSuggestion | null => {
            const label = x.label || x.title || x.name || `方向 ${i + 1}`;
            const emoji = x.emoji || "✨";
            const q = x.recommendedQuery || x.query || x.searchQuery || label;
            const topics = Array.isArray(x.topics) ? (x.topics as string[]).map((t) => String(t).toLowerCase()) : [];
            const count = typeof x.count === "number" ? x.count : topics.reduce((s, t) => s + (topicCount[t] || 0), 0) || 1;
            const pick = x.sampleRepo || x.repo ? { repo: x.sampleRepo || x.repo, stars: x.sampleStars || x.stars } : pickRepoFor(topics);
            return {
              label: String(label).slice(0, 20),
              emoji: String(emoji).slice(0, 4),
              recommendedQuery: String(q).slice(0, 80),
              count,
              topics: topics.slice(0, 6),
              sampleRepo: pick.repo,
              sampleStars: typeof pick.stars === "number" ? pick.stars : undefined,
            };
          })
          .filter((v): v is HotSuggestion => Boolean(v) && Boolean(v?.label) && Boolean(v?.recommendedQuery));
      }
    }
  } catch {
    // continue to text parse
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: HotSuggestion[] = [];
  let cur: Partial<HotSuggestion> | null = null;
  for (const rawLine of lines) {
    const line = rawLine;
    const startMatch = line.match(/^\d+\s*[.、\)．]\s*[\[\{【]?\s*([^\]】\}\]]+?)[\]\}】]?\s*[—\-:：]?\s*/);
    if (startMatch) {
      if (cur) out.push({ label: cur.label || `方向 ${out.length + 1}`, emoji: cur.emoji || "✨", recommendedQuery: cur.recommendedQuery || cur.label || "", count: cur.count || 0, topics: cur.topics || [] });
      const tail = line.slice(startMatch[0].length).trim();
      const title = startMatch[1].replace(/^[\-—:：\s]+/, "").trim();
      cur = { label: title, emoji: "✨", topics: [], count: 0 };
      const qMatch = tail.match(/(?:query|关键词|搜索)[：:]\s*([^\n,，;；]+)/);
      if (qMatch) cur.recommendedQuery = qMatch[1].trim();
      const tMatch = tail.match(/(?:topics|标签|topic)[：:]\s*([^\n]+)$/i);
      if (tMatch) cur.topics = tMatch[1].split(/[,，、;；\s]+/).map((s) => s.toLowerCase().replace(/^#/, "")).filter(Boolean);
      continue;
    }
    if (!cur) continue;
    const qm = line.match(/^(?:推荐[查询搜索词]*|query|搜索)[：:]\s*(.+)$/i);
    if (qm) {
      cur.recommendedQuery = qm[1].trim();
      continue;
    }
    const tm = line.match(/^(?:topics?|标签|代表 topic)[：:]\s*(.+)$/i);
    if (tm) {
      cur.topics = tm[1].split(/[,，、;；\s]+/).map((s) => s.toLowerCase().replace(/^#/, "")).filter(Boolean);
      continue;
    }
    const em = line.match(/(?:emoji|表情)[：:]\s*(.)/i);
    if (em) {
      cur.emoji = em[1];
      continue;
    }
  }
  if (cur) out.push({ label: cur.label || `方向 ${out.length + 1}`, emoji: cur.emoji || "✨", recommendedQuery: cur.recommendedQuery || cur.label || "", count: cur.count || 0, topics: cur.topics || [] });

  return out.map((o) => {
    const count = o.count || o.topics.reduce((s, t) => s + (topicCount[t] || 0), 0) || 1;
    const pick = pickRepoFor(o.topics);
    return { ...o, count, sampleRepo: o.sampleRepo || pick.repo, sampleStars: o.sampleStars || pick.stars };
  }).filter((o) => o.label && o.recommendedQuery);
}

export async function GET(request: NextRequest) {
  try {
    applyReqSettings(request);
    const sp = request.nextUrl.searchParams;
    const sinceRaw = (sp.get("since") as SINCE_VALUES | null) || "monthly";
    const since: SINCE_VALUES =
      sinceRaw === "daily" || sinceRaw === "weekly" || sinceRaw === "monthly" ? sinceRaw : "monthly";
    const language = sp.get("language") || undefined;
    const topic = sp.get("topic") || undefined;
    const perPage = Number(sp.get("perPage")) || 21;
    const revalidate = sp.get("revalidate") !== null;

    const cacheKey = `hot_suggestions:v1:${since}:${language || ""}:${topic || ""}:${perPage}`;
    if (revalidate) deleteCache(cacheKey);

    const data = await withCache(cacheKey, 3600 * 12, async () => {
      let suggestions: HotSuggestion[] = [];
      let mode: "ai" | "fallback" = "fallback";

      const result = await getTrendingRepos({
        since,
        language,
        topic,
        sort: "stars",
        order: "desc",
        page: 1,
        perPage,
      }).catch(() => ({ items: [], total: 0 }));

      const items = result?.items || [];
      const topicCount: Record<string, number> = {};
      for (const r of items) {
        for (const t of r.topics || []) {
          const lc = String(t).toLowerCase();
          topicCount[lc] = (topicCount[lc] || 0) + 1;
        }
      }

      const topTopics = Object.entries(topicCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40);

      if (isAIEnabled() && topTopics.length >= 3) {
        const sinceLabel: Record<string, string> = {
          daily: "近 24 小时",
          weekly: "近 7 天",
          monthly: "近 30 天",
        };
        const topReposLines = items
          .slice(0, 15)
          .map(
            (r, i) =>
              `${i + 1}. ${r.full_name} ⭐${r.stargazers_count}${r.language ? ` lang:${r.language}` : ""}${(r.topics || []).length ? ` topics:${(r.topics || []).slice(0, 6).join(",")}` : ""}`
          )
          .join("\n");

        const userPrompt = `你是 GitHub 热门话题发现助手。根据下面 ${sinceLabel[since]} 的热门项目及其 topics，帮我产出 6-8 个"中文用户在 GitHub 搜索时最常用的方向关键词"。

要求每个方向都是一个"搜索意图"（例如"YOLO 目标检测"、"Claude Agent"、"RAG 知识库"、"前端 UI 组件库"），每个方向输出一个 JSON 对象：
{
  "label": "中文短标签 <= 8 个字",
  "emoji": "1 个最贴切的 emoji",
  "recommendedQuery": "在 GitHub 搜索框里应该填的英文 query（能直接搜到）",
  "topics": ["代表这个方向的 1-3 个英文 topic，小写"],
  "count": 这个方向大概在热门项目里出现了多少次（用 topics 估算），
  "sampleRepo": "可选，这个方向最有代表性的一个 owner/repo"
}

不要任何解释文字，直接输出 JSON 数组，必须是 valid JSON（字段名双引号），长度 6-8 个。

【热门 Topics Top 40 (topic:出现次数)】
${topTopics.map(([k, v]) => `- ${k}: ${v}`).join("\n")}

【代表项目 Top 15】
${topReposLines}
`;
        const ai = await askLLM(
          userPrompt,
          "你是 GitHub 搜索体验专家，熟悉中文开发者常用的搜索关键词组合。只输出严格合法 JSON 数组（6-8 个对象），不要 markdown 代码块前后说明文字，不要多余逗号。",
          1200,
          0.2
        );
        if (ai.text) {
          const parsed = parseSuggestions(ai.text, topicCount, items);
          if (parsed.length >= 3) {
            suggestions = parsed.slice(0, 8);
            mode = "ai";
          }
        }
      }

      if (suggestions.length === 0) {
        mode = "fallback";
        suggestions = FALLBACK.slice();
      }

      suggestions = suggestions.map((s) => ({
        ...s,
        count: s.count || s.topics.reduce((acc, t) => acc + (topicCount[t] || 0), 0) || 1,
      }));

      return {
        success: true as const,
        mode,
        since,
        topTopicCount: topTopics.length,
        sampleCount: items.length,
        suggestions,
      };
    });

    return Response.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return Response.json(
      { success: false, error: msg, mode: "fallback" as const, suggestions: FALLBACK },
      { status: 500 }
    );
  }
}

import { NextRequest } from "next/server";
import { isAIEnabled, askLLM } from "@/lib/llm";
import { withCache, deleteCache } from "@/lib/cache";
import { searchRepos } from "@/lib/github";
import { applyReqSettings } from "@/lib/applyReqSettings";

export const runtime = "nodejs";

type SearchSuggestions = {
  stars?: string;
  pushed?: string;
  language?: string;
  topics?: string[];
};

type RewriteData = {
  success: boolean;
  error?: string | null;
  mode: "ai" | "fallback";
  originalQuery: string;
  rewrittenQuery: string;
  explanation: string;
  suggestions: SearchSuggestions;
  used: boolean;
  fallbackLevel: number;
  rewriteTotalCount: number;
  originalTotalCount: number;
};

function parseJSON<T>(text: string, fallback: T): T {
  try {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1) return fallback;
    return JSON.parse(text.slice(first, last + 1)) as T;
  } catch {
    return fallback;
  }
}

function countBoolOps(q: string): number {
  const s = q.replace(/"[^"]*"/g, " ").replace(/in:[a-z,]+/gi, " ");
  let n = 0;
  for (const tok of s.split(/\s+/)) {
    const t = tok.replace(/[()]/g, "").toUpperCase();
    if (t === "OR" || t === "AND" || t === "NOT") n++;
    if (tok.startsWith("-")) n++;
  }
  return n;
}

function trimQueryToGitHubLimit(q: string, original: string): string {
  if (!q) return original;
  let out = q.trim();
  let max = 8;
  while (countBoolOps(out) > 5 && max-- > 0) {
    out = out
      .replace(/\s+OR\s+[A-Za-z0-9.*_-]+/i, "")
      .replace(/\s+-[A-Za-z0-9._*-]+(\s|$)/, " ")
      .replace(/\(\s*\)/g, "")
      .trim();
  }
  if (countBoolOps(out) > 5) {
    return original;
  }
  return out || original;
}

function relaxQuery(rewritten: string, original: string, level: number): string {
  switch (level) {
    case 1: {
      return rewritten.replace(/in:[a-z,]+/gi, "").trim() || original;
    }
    case 2: {
      const step1 = rewritten.replace(/in:[a-z,]+/gi, "").trim();
      return step1
        .replace(/\s+OR\s+[A-Za-z0-9.*_-]+/gi, "")
        .replace(/\s+-[A-Za-z0-9._*-]+(\s|$)/, " ")
        .trim() || original;
    }
    case 3: {
      return original;
    }
    default:
      return original;
  }
}

async function peekTotalCount(
  query: string,
  language?: string,
  topic?: string,
): Promise<number> {
  try {
    const r = await searchRepos({
      query,
      language: language || undefined,
      topic: topic || undefined,
      page: 1,
      perPage: 1,
      sort: "stars",
      order: "desc",
    });
    return Number(r.total_count) || 0;
  } catch {
    return -1;
  }
}

export async function GET(request: NextRequest) {
  try {
    applyReqSettings(request);
    const sp = request.nextUrl.searchParams;
    const q = (sp.get("q") || "").trim();
    const language = sp.get("language") || undefined;
    const topic = sp.get("topic") || undefined;
    const revalidate = sp.get("revalidate") !== null;

    if (!q) {
      return Response.json({
        success: false,
        error: "q 参数不能为空",
        mode: "fallback",
        originalQuery: "",
        rewrittenQuery: "",
        explanation: "",
        suggestions: {},
        used: false,
        fallbackLevel: 0,
        rewriteTotalCount: 0,
        originalTotalCount: 0,
      } satisfies RewriteData);
    }

    const cacheKey = `rewrite_query:v2:${q}::${language || ""}::${topic || ""}`;
    if (revalidate) deleteCache(cacheKey);

    const data = await withCache<RewriteData>(cacheKey, 86400 / 2, async () => {
      if (!isAIEnabled()) {
        return {
          success: true,
          mode: "fallback",
          originalQuery: q,
          rewrittenQuery: q,
          explanation: "",
          suggestions: {},
          used: false,
          fallbackLevel: 0,
          rewriteTotalCount: 0,
          originalTotalCount: 0,
        };
      }

      const userPrompt = `你是一位 GitHub 高级搜索语法专家，擅长把用户的自然语言描述翻译成"效果最好的 GitHub 仓库搜索 query"。

【用户原始搜索词】
"${q}"${language ? `\n【用户已选编程语言】${language}` : ""}${topic ? `\n【用户已选主题/Topic】${topic}` : ""}

请输出 **严格合法 JSON**（不要 markdown，不要 \`\`\`json 包裹），结构如下：
{
  "rewrittenQuery": string,        // 传给 GitHub /search/repositories?q= 的最终 query（最重要）
  "explanation": string,           // 一句话中文说明：你改了什么、为什么这样更准（≤80字）
  "suggestions": {
    "stars": string | null,        // 推荐 stars 门槛字符串，如 ">100"、">500"、null 表示不推荐
    "pushed": string | null,       // 推荐 pushed 日期字符串，如 ">=2024-06-01"、null 表示不推荐
    "language": string | null,     // 推荐的 GitHub language 名称，如 "Python"，用户已选就不要覆盖
    "topics": string[] | null      // 推荐的 1-5 个 GitHub topics
  }
}

【你写 rewrittenQuery 的要点】
1. 补充同义词/系列名，但总数要克制：比如用户搜"yolov"→ 选最关键的 3-4 个版本名 "yolov* OR yolov8 OR yolov10 OR ultralytics"
2. 限定搜索位置：优先加 "in:name,description,topics"（如果是代码实现类项目）；如果用户描述是"教程、资料、列表类"，加 "in:readme,name,description"
3. 排除词要特别克制：一般不超过 1 个，比如 "-awesome"，除非明显有大量噪音
4. 短语匹配：如果是一串词且是一个项目名，用引号包裹，如 "\"segment anything\""
5. query 内的 "OR / AND / NOT / -排除词" 总数量不要超过 5 个（GitHub 免费 Search API 有这个硬限制，多了直接 422），宁愿少一点同义词也不要超
6. 不要包含"language:xxx"、"topic:xxx"、"stars:>xxx"、"pushed:>=xxx"这些 filter，这些放到 suggestions 字段里，让前端通过独立筛选参数呈现，不要污染 query
`;

      const ai = await askLLM(
        userPrompt,
        "你是 GitHub 搜索语法翻译专家，只输出严格的 JSON，绝不要 markdown、绝不要 ```json 包裹、绝不要额外文字。JSON 里的中文不超过 80 字。",
        1200,
        0.3
      );

      if (!ai.text) {
        return {
          success: true,
          mode: "fallback",
          originalQuery: q,
          rewrittenQuery: q,
          explanation: "",
          suggestions: {},
          used: false,
          fallbackLevel: 0,
          rewriteTotalCount: 0,
          originalTotalCount: 0,
        };
      }

      const parsed = parseJSON<Partial<RewriteData> & { suggestions?: SearchSuggestions }>(
        ai.text,
        {}
      );

      const rewrittenRaw = String(parsed.rewrittenQuery || q).trim() || q;
      const baseTrimmed = trimQueryToGitHubLimit(rewrittenRaw, q);
      const sugg = parsed.suggestions || {};

      const originalCountP = peekTotalCount(q, language, topic);
      const firstRewrittenCountP = peekTotalCount(baseTrimmed, language, topic);
      const [originalCount, firstRewrittenCount] = await Promise.all([originalCountP, firstRewrittenCountP]);

      let finalQuery = baseTrimmed;
      let fallbackLevel = 0;
      let finalCount = firstRewrittenCount;

      const baseOriginalThreshold = originalCount > 0 ? Math.max(10, Math.floor(originalCount / 3)) : 50;
      const rewriteUnder = (c: number) => c >= 0 && c < baseOriginalThreshold;

      if (rewriteUnder(firstRewrittenCount)) {
        const relaxed1 = relaxQuery(baseTrimmed, q, 1);
        const c1 = await peekTotalCount(relaxed1, language, topic);
        if (c1 >= 0 && c1 > firstRewrittenCount && c1 >= baseOriginalThreshold) {
          finalQuery = relaxed1;
          finalCount = c1;
          fallbackLevel = 1;
        } else {
          const relaxed2 = relaxQuery(baseTrimmed, q, 2);
          const c2 = await peekTotalCount(relaxed2, language, topic);
          if (c2 >= 0 && c2 > firstRewrittenCount && c2 >= baseOriginalThreshold) {
            finalQuery = relaxed2;
            finalCount = c2;
            fallbackLevel = 2;
          } else {
            finalQuery = q;
            finalCount = originalCount;
            fallbackLevel = 3;
          }
        }
      }

      const baseExpl = String(parsed.explanation || "").slice(0, 140);
      let expl = baseExpl;
      if (fallbackLevel === 1) {
        expl = baseExpl ? `${baseExpl}（为保证结果数，已自动放宽 in: 限定）` : "为保证结果数，已自动放宽 in: 限定";
      } else if (fallbackLevel === 2) {
        expl = baseExpl ? `${baseExpl}（为保证结果数，已自动简化同义词与排除词）` : "为保证结果数，已自动简化同义词与排除词";
      } else if (fallbackLevel === 3) {
        expl = baseExpl ? `${baseExpl}（为避免结果过少，已使用原始关键词）` : "为避免结果过少，已使用原始关键词";
      }

      return {
        success: true,
        mode: "ai",
        originalQuery: q,
        rewrittenQuery: finalQuery,
        explanation: expl,
        suggestions: {
          stars: sugg.stars || undefined,
          pushed: sugg.pushed || undefined,
          language: sugg.language || undefined,
          topics: Array.isArray(sugg.topics) ? sugg.topics.slice(0, 5) : undefined,
        },
        used: finalQuery !== q,
        fallbackLevel,
        rewriteTotalCount: finalCount >= 0 ? finalCount : 0,
        originalTotalCount: originalCount >= 0 ? originalCount : 0,
      } satisfies RewriteData;
    });

    return Response.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return Response.json(
      {
        success: false,
        error: msg,
        mode: "fallback",
        originalQuery: "",
        rewrittenQuery: "",
        explanation: "",
        suggestions: {},
        used: false,
        fallbackLevel: 0,
        rewriteTotalCount: 0,
        originalTotalCount: 0,
      },
      { status: 500 }
    );
  }
}

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

    const cacheKey = `rewrite_query:v3:${q}::${language || ""}::${topic || ""}`;
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
1. 多语言同义词扩充（根据搜索内容判断，不要死套，科技发达国家语言同义词用引号包裹再 OR 进去）：
   - 必加「中文」常用同义词或直译：比如 "射击游戏" → 加 "射击游戏" OR "FPS游戏" OR "第一人称射击"；"前端组件" → 加 "前端组件" OR "组件库" OR "UI组件"
   - 「英文」标准术语本来就有，但还要再加 2~4 个英文近义词/系列名/缩写：比如 yolov → yolov8 OR yolov10 OR ultralytics
   - 根据内容智能判断是否加这些科技强国语言同义词（日本/韩国/德国/法国/俄罗斯/以色列/芬兰/瑞典）的常用词：
     * 日语：常见日语社区常用编程相关词汇（如 フレームワーク、AI、ゲームエンジン、ライブラリ 等）
     * 韩语/德语/法语/俄语等只有在搜索相关领域有知名开源项目或知名公司开发时才加
   - 语言同义词必须用双引号精确括起来，再 OR 进去，避免分词问题
2. 合并中文 + 英文 + 其他语言同义词一起，英文主写在 rewrittenQuery 合并
3. 限定搜索位置：优先加 "in:name,description,topics,readme"（readme 能命中多语言文档/中文/日文韩文等文档内容）；教程/资料/列表类项目才加 "in:readme,name,description"
4. 排除词特别克制：一般不超过 1 个，比如 "-awesome"，除非明显噪音
5. 短语匹配如果是一串词且是一个项目名，用引号包裹，如 "\"segment anything\""
6. OR / AND / NOT / -排除词 总数量不要超过 5 个（GitHub Search API 有硬限制，多了 422），少点同义词不要超
7. 绝对不要包含 language:/topic:/stars:/pushed: 这些 filter，这些写进 suggestions
8. 中文/其他非英文词汇、或 日语/韩语/德语 等国家语言的同义词 要用双引号包着
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

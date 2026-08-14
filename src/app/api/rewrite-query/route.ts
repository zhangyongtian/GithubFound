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
      let step1 = rewritten.replace(/in:[a-z,]+/gi, "").trim();
      const chineseOrCJK = /"[^"]*[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u1e00-\u1eff][^"]*"/g;
      step1 = step1.replace(chineseOrCJK, "").replace(/\s+OR\s+OR\s+/gi, " OR ").replace(/(^\s*OR\s+|\s+OR\s*$)/gi, "").trim();
      return step1
        .replace(/\(\s*\)/g, "")
        .trim() || original;
    }
    case 3: {
      let step1 = rewritten.replace(/in:[a-z,]+/gi, "").trim();
      const chineseOrCJK = /"[^"]*[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff\u1e00-\u1eff][^"]*"/g;
      step1 = step1.replace(chineseOrCJK, "").replace(/\s+OR\s+OR\s+/gi, " OR ").replace(/(^\s*OR\s+|\s+OR\s*$)/gi, "").trim();
      const excluded = /\s+-[A-Za-z0-9._*-]+(\s|$)/g;
      step1 = step1.replace(excluded, " ").trim();
      return step1
        .replace(/\(\s*\)/g, "")
        .trim() || original;
    }
    case 4: {
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

    const cacheKey = `rewrite_query:v5:${q}::${language || ""}::${topic || ""}`;
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

【你写 rewrittenQuery 的要点 —— 英文主搜索优先】
1. 多语言同义词扩充优先级：英文主词 > 中文同义词 > 可选日/韩/德/法等（OR 总数≤5，不够就砍掉中文以外的，英文绝对不能丢）
   - 【强制·最高优先级】英文核心词必须 2~4 个：无论用户输入中文还是英文，先把核心语义翻成英文标准开源术语再 OR：
     * 例：用户输入"射击游戏辅助"→"aim assist" OR "first-person shooter" OR "fps cheat"
     * 例：用户输入"大模型推理"→"llm inference" OR "vllm" OR "llama.cpp"
     * 例：用户输入"前端组件库"→"ui component" OR "design system" OR "component library"
     * 例：用户输入"yolov 射击游戏"→yolov 已有英文，再补 yolov8 OR ultralytics 及英文语义："aim assist" OR "fps"
   - 【次优先级】中文同义词保留 1~2 个（用户有中文输入时）：如"射击游戏" OR "FPS游戏"；"AI智能体" OR "Agent"
   - 【可选·占剩余名额】科技强国语言同义词：
     * 日语：ゲームエイム(游戏瞄准)、フレームワーク(框架)、LLM、AIエージェント 等
     * 韩语：UI 컴포넌트、LLM 추론 等；德语/法语只在欧洲有大生态时加（如 blockchain/quantum）
   - 所有多语言词必须双引号精确括起来 OR 进去，英文短语也建议加引号避免分词
2. rewrittenQuery 结构：英文主词写在最前（无引号单也行），然后才是中文 + 其他语言带引号 OR
3. 限定搜索位置：加 "in:name,description,topics,readme"（readme 能命中多语言文档，尤其英文 README 是国际开源主流）
4. 排除词特别克制：最多 1 个，如 "-awesome" "-tutorial" "-list"，除非明显噪音
5. 短语匹配如果是一个专有项目名，用引号包裹如 "\"segment anything\""
6. OR / AND / NOT / -排除词 总数量 ≤ 5（GitHub 硬限制），不够时砍：先砍日韩德法→再砍中文→英文主词必须留
7. 绝对不要包含 language:/topic:/stars:/pushed: 这些 filter，这些写进 suggestions
8. 所有非英文词汇、英文短语、其他国家语言词都用双引号包着
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

      const baseOriginalThreshold = originalCount > 0 ? Math.max(2, Math.floor(originalCount / 20)) : 20;
      const softThreshold = (c: number) => c >= 0 && c >= baseOriginalThreshold;
      const absMin = (c: number) => c >= 0 && c >= 2;

      if (!softThreshold(firstRewrittenCount)) {
        const relaxed1 = relaxQuery(baseTrimmed, q, 1);
        const c1 = await peekTotalCount(relaxed1, language, topic);
        if (softThreshold(c1) && c1 > (firstRewrittenCount < 0 ? 0 : firstRewrittenCount)) {
          finalQuery = relaxed1;
          finalCount = c1;
          fallbackLevel = 1;
        } else {
          const relaxed2 = relaxQuery(baseTrimmed, q, 2);
          const c2 = await peekTotalCount(relaxed2, language, topic);
          if (softThreshold(c2) && c2 > (firstRewrittenCount < 0 ? 0 : firstRewrittenCount)) {
            finalQuery = relaxed2;
            finalCount = c2;
            fallbackLevel = 2;
          } else {
            const relaxed3 = relaxQuery(baseTrimmed, q, 3);
            const c3 = await peekTotalCount(relaxed3, language, topic);
            if (absMin(c3) && c3 > (firstRewrittenCount < 0 ? 0 : firstRewrittenCount)) {
              finalQuery = relaxed3;
              finalCount = c3;
              fallbackLevel = 3;
            } else if (absMin(firstRewrittenCount)) {
              finalQuery = baseTrimmed;
              finalCount = firstRewrittenCount;
              fallbackLevel = 0;
            } else {
              finalQuery = q;
              finalCount = originalCount;
              fallbackLevel = 4;
            }
          }
        }
      }

      const baseExpl = String(parsed.explanation || "").slice(0, 140);
      let expl = baseExpl;
      if (fallbackLevel === 1) {
        expl = baseExpl ? `${baseExpl}（已放宽 in: 限定提升结果数）` : "已放宽 in: 限定提升结果数";
      } else if (fallbackLevel === 2) {
        expl = baseExpl ? `${baseExpl}（已精简中日韩同义词，保留英文主词提升结果）` : "已精简中日韩同义词，保留英文主词提升结果";
      } else if (fallbackLevel === 3) {
        expl = baseExpl ? `${baseExpl}（仅保留英文核心词与排除词，确保有结果）` : "仅保留英文核心词与排除词，确保有结果";
      } else if (fallbackLevel === 4) {
        expl = baseExpl ? `${baseExpl}（改写结果过少，兜底使用输入关键词）` : "改写结果过少，兜底使用输入关键词";
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

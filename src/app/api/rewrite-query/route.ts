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

const EN_TRANSLATION_HINTS: Record<string, string[]> = {
  免费: ["free", "open source"],
  电视: ["tv", "iptv", "streaming"],
  视频: ["video", "streaming", "media"],
  音乐: ["music", "audio"],
  游戏: ["game", "gaming"],
  射击: ["fps", "shooter", "aim"],
  辅助: ["assist", "helper", "tool"],
  检测: ["detection", "detect"],
  目标: ["object", "target"],
  聊天: ["chat", "conversation"],
  机器人: ["bot", "chatbot", "agent"],
  大模型: ["llm", "large language model"],
  模型: ["model", "llm"],
  推理: ["inference", "serving"],
  前端: ["frontend", "ui", "web"],
  组件: ["component", "library"],
  库: ["library", "lib"],
  工具: ["tool", "utility", "cli"],
  框架: ["framework"],
  智能体: ["agent", "autonomous"],
  编程: ["coding", "programming", "code"],
  学习: ["learn", "tutorial", "course"],
  资源: ["resources", "awesome", "collection"],
  算法: ["algorithm", "leetcode"],
  数据: ["data", "database"],
  可视化: ["visualization", "chart", "dashboard"],
  管理: ["admin", "dashboard", "management"],
  后台: ["admin", "backend", "dashboard"],
  接口: ["api", "rest", "graphql"],
  开源: ["open source", "oss", "self-hosted"],
  自动: ["auto", "automation"],
  办公: ["office", "productivity", "workspace"],
  笔记: ["notes", "note-taking", "knowledge base"],
  绘画: ["drawing", "image generation", "stable diffusion"],
  图片: ["image", "photo", "vision"],
  识别: ["recognition", "ocr"],
  翻译: ["translate", "translation"],
  语音: ["voice", "speech", "asr", "tts"],
  下载: ["download", "downloader"],
  电影: ["movie", "media", "video"],
  直播: ["live", "streaming", "livestream"],
  导航: ["navigation", "dashboard", "homepage"],
  网盘: ["cloud storage", "cloud drive", "webdav"],
  搜索: ["search", "semantic search", "rag"],
};

function containsCJK(s: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(s);
}

function forceExpandEnglish(q: string, original: string): string {
  const trimmed = (q || "").trim();
  if (!trimmed) return original;

  const hasEnoughEnglish = /[A-Za-z]{3,}/.test(trimmed);
  const hasAnyEnglish = /[A-Za-z]/.test(trimmed);
  const hasConnectingOps = /\b(OR|AND|NOT)\b|in:|^\s*-/i.test(trimmed);
  const looksExpanded = hasEnoughEnglish || (hasAnyEnglish && hasConnectingOps);
  if (looksExpanded && trimmed !== original) return trimmed;

  const tokens: string[] = [];
  Object.entries(EN_TRANSLATION_HINTS).forEach(([zh, ens]) => {
    if (original.includes(zh)) {
      for (const en of ens) {
        if (!tokens.includes(en)) tokens.push(en);
      }
    }
  });
  const extractedEn = (original.match(/[A-Za-z][A-Za-z0-9._-]{1,}/g) || []).map((x) => x.toLowerCase());
  for (const e of extractedEn) {
    if (!tokens.includes(e)) tokens.push(e);
  }

  if (!tokens.length) {
    tokens.push("open source", "self-hosted");
  }

  const unique: string[] = [];
  for (const t of tokens) {
    if (!unique.includes(t)) unique.push(t);
    if (unique.length >= 4) break;
  }
  const quoted = unique.map((w) => (/[\s-]/.test(w) ? `"${w}"` : w));
  const base = quoted.join(" OR ") || `"open source" OR "github"`;
  return `${base}`;
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

    const cacheKey = `rewrite_query:v7:${q}::${language || ""}::${topic || ""}`;
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

【你写 rewrittenQuery 的要点 —— 英文主搜索优先 + 描述不准也能命中的发散扩展】
1. 多语言同义词扩充优先级：英文核心词(必2~4个) > 英文宽泛/黑话/近义词(必1~2个) > 中文同义词(1个保底) > 可选日/韩/德/法等
   - 【强制·最高优先级】英文核心词 2~4 个标准开源术语 OR：
     * 例：射击游戏辅助→"aim assist" OR "first-person shooter"
     * 例：大模型推理→"llm inference" OR "vllm" OR "llama.cpp"
     * 例：前端组件库→"ui component" OR "design system" OR "component library"
     * 例：yolov 射击游戏→yolov8 OR ultralytics + "aim assist"
   - 【必加·第二优先级】英文「宽泛词/社区黑话/近义词/典型错拼」1~2 个：目的是"用户描述不准也能命中"
     * 例：射击游戏辅助→加 "aimbot" 或 "triggerbot" 或 "valorant" 或 "cs2"（黑话/具体游戏名）
     * 例：大模型推理→加 "gpu inference" 或 "llm serving"（宽泛近义词）
     * 例：AI智能体→加 "autonomous agent" 或 "agent framework"（宽泛）
     * 例："聊天机器人"→加 "chatbot" OR "llm chat"（宽泛）
   - 【第三优先级】中文同义词只保留 1 个保底，别多（占 OR 名额）
   - 【可选·剩下名额】科技强国语言词：日语（ゲームエイム/フレームワーク/AIエージェント）、韩/德/法等仅大生态
   - 所有多语言词必须双引号精确括起来 OR
2. rewrittenQuery 结构顺序：英文核心词→宽泛黑话词→中文同义词（OR 不够时先砍中文→再砍日韩，英文核心+宽泛绝不丢）
3. in 限定两种模式（根据用户描述精准度判断）：
   - 模式 A「精准命中」用 in:name,description,topics,readme（用户描述准确时）
   - 模式 B「宽泛命中」【推荐默认用这个】不加任何 in:（因为用户经常描述不准，不加 in 能命中 README 正文/issue/discussions，结果多 5~10 倍）
   - ⚠️ 默认用模式 B（不加 in:），除非用户描述非常专业明确
4. 排除词完全禁用！不要加任何 -awesome -tutorial -list 等！（描述不准时排除词会误伤真实目标项目）
5. 专有项目名用引号，如 "\"segment anything\""
6. OR / AND / NOT / - 总数 ≤ 5（GitHub 硬限制），名额不够裁剪顺序：先砍日韩德法 → 再砍中文同义词 → 英文核心/宽泛必保
7. 绝对不要包含 language:/topic:/stars:/pushed: 这些 filter，写进 suggestions
8. 所有非英文、英文短语、其他国家语言词都用双引号包着
9. 【绝对硬约束·不遵守视为失败】rewrittenQuery 绝对禁止等于原始 q，绝对禁止纯中文（不含任何英文/数字/OR 连接）
   - 就算完全不知道怎么扩展，也至少把 q 翻译成英文后再加引号输出
   - 例：输入 "免费电视" → 至少输出 `"free tv" OR "iptv"`，绝对不能输出 "免费电视"
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
      const forceExpanded = forceExpandEnglish(rewrittenRaw, q);
      const aiActuallyExpanded = rewrittenRaw !== q && rewrittenRaw !== forceExpanded;
      const baseTrimmedBefore = aiActuallyExpanded
        ? rewrittenRaw
        : forceExpanded;
      const baseTrimmed = trimQueryToGitHubLimit(baseTrimmedBefore, forceExpanded);
      const usedHeuristicExpansion = !aiActuallyExpanded;
      const sugg = parsed.suggestions || {};

      const originalCountP = peekTotalCount(q, language, topic);
      const firstRewrittenCountP = peekTotalCount(baseTrimmed, language, topic);
      const [originalCount, firstRewrittenCount] = await Promise.all([originalCountP, firstRewrittenCountP]);

      let finalQuery = baseTrimmed;
      let fallbackLevel = 0;
      let finalCount = firstRewrittenCount;

      const baseOriginalThreshold = originalCount > 0 ? Math.max(1, Math.floor(originalCount / 40)) : 10;
      const softThreshold = (c: number) => c >= 0 && c >= baseOriginalThreshold;
      const absMin = (c: number) => c >= 0 && c >= 1;

      if (!softThreshold(firstRewrittenCount)) {
        const relaxed1 = relaxQuery(baseTrimmed, q, 1);
        const c1 = await peekTotalCount(relaxed1, language, topic);
        if (absMin(c1)) {
          finalQuery = relaxed1;
          finalCount = c1;
          fallbackLevel = 1;
        } else {
          const relaxed2 = relaxQuery(baseTrimmed, q, 2);
          const c2 = await peekTotalCount(relaxed2, language, topic);
          if (absMin(c2)) {
            finalQuery = relaxed2;
            finalCount = c2;
            fallbackLevel = 2;
          } else {
            const relaxed3 = relaxQuery(baseTrimmed, q, 3);
            const c3 = await peekTotalCount(relaxed3, language, topic);
            if (absMin(c3)) {
              finalQuery = relaxed3;
              finalCount = c3;
              fallbackLevel = 3;
            } else {
              finalQuery = baseTrimmed;
              finalCount = firstRewrittenCount;
              fallbackLevel = 0;
            }
          }
        }
      }

      const baseExpl = String(parsed.explanation || "").slice(0, 140);
      let expl = baseExpl;
      if (usedHeuristicExpansion) {
        const tag = `（AI未产出标准改写，已启用启发式英文扩展保底，确保高质量搜索）`;
        expl = baseExpl ? `${baseExpl} ${tag}` : tag.slice(1, -1);
      }
      if (fallbackLevel === 1) {
        expl = `${expl}（已自动放宽搜索范围提升结果数）`;
      } else if (fallbackLevel === 2) {
        expl = `${expl}（已精简中日韩同义词，保留英文+宽泛黑话）`;
      } else if (fallbackLevel === 3) {
        expl = `${expl}（仅保留英文核心+宽泛黑话，确保命中）`;
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

import { NextRequest } from "next/server";
import { getRepo, getRepoReadme } from "@/lib/github";
import { summarizeRepo, isAIEnabled } from "@/lib/llm";
import { applyReqSettings } from "@/lib/applyReqSettings";

export const runtime = "nodejs";
export const revalidate = 3600;

function extractReadmeIntro(readme: string | null, maxLen = 300): string {
  if (!readme) return "";
  const clean = readme
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = clean.split(/\n+/).filter((l) => l.trim().length > 0);
  let acc = "";
  for (const line of lines) {
    const next = acc ? acc + " " + line.trim() : line.trim();
    if (next.length > maxLen) break;
    acc = next;
  }
  return acc;
}

export async function GET(request: NextRequest) {
  try {
    applyReqSettings(request);
    const sp = request.nextUrl.searchParams;
    const owner = sp.get("owner");
    const repo = sp.get("repo");
    const descriptionParam = sp.get("description") || null;
    const revalidate = sp.get("revalidate") !== null;

    if (!owner || !repo) {
      return Response.json(
        { success: false, error: "缺少 owner/repo 参数", mode: "fallback" as const },
        { status: 400 }
      );
    }

    let repoData: { description: string | null } = { description: descriptionParam };
    let readme: string | null = null;
    let upstreamError: string | null = null;

    try {
      const [r, rm] = await Promise.all([
        getRepo(owner, repo),
        getRepoReadme(owner, repo),
      ]);
      repoData = r;
      readme = rm;
    } catch (e) {
      upstreamError = e instanceof Error ? e.message : String(e);
      if (!repoData.description) repoData.description = descriptionParam;
    }

    const aiEnabled = isAIEnabled();
    const { summary, mode } = await summarizeRepo(
      owner,
      repo,
      repoData.description,
      readme,
      { force: revalidate }
    );

    const readmeSnippet = extractReadmeIntro(readme) ||
      extractReadmeIntro(repoData.description || "", 200);

    return Response.json({
      success: !!(summary || readmeSnippet),
      mode: summary ? mode : "fallback",
      ai_enabled: aiEnabled,
      summary: summary || undefined,
      readme_snippet: readmeSnippet || undefined,
      error: upstreamError && !summary && !readmeSnippet ? upstreamError : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { success: false, error: msg, mode: "fallback" as const, readme_snippet: "" },
      { status: 500 }
    );
  }
}

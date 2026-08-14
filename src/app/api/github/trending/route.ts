import { NextRequest } from "next/server";
import { getTrendingRepos } from "@/lib/github";
import { applyReqSettings } from "@/lib/applyReqSettings";

export const runtime = "nodejs";
export const revalidate = 900;

export async function GET(request: NextRequest) {
  try {
    applyReqSettings(request);
    const sp = request.nextUrl.searchParams;
    const language = sp.get("language") || undefined;
    const topic = sp.get("topic") || undefined;
    const sort = (sp.get("sort") as "stars" | "forks" | "updated") || "stars";
    const since =
      (sp.get("since") as "daily" | "weekly" | "monthly") || "daily";
    const perPage = Math.min(Number(sp.get("perPage") || 30), 100);
    const page = Math.max(Number(sp.get("page") || 1), 1);

    const result = await getTrendingRepos({
      language,
      topic,
      sort,
      since,
      perPage,
      page,
    });

    return Response.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { success: false, error: msg, items: [], total_count: 0, incomplete_results: false },
      { status: 500 }
    );
  }
}

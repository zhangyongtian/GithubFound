import { NextRequest } from "next/server";
import { searchRepos } from "@/lib/github";
import { applyReqSettings } from "@/lib/applyReqSettings";

export const runtime = "nodejs";
export const revalidate = 600;

export async function GET(request: NextRequest) {
  try {
    applyReqSettings(request);
    const sp = request.nextUrl.searchParams;
    const query = sp.get("query") || undefined;
    const language = sp.get("language") || undefined;
    const topic = sp.get("topic") || undefined;
    const sort =
      (sp.get("sort") as "stars" | "forks" | "updated" | "help-wanted-issues") ||
      "stars";
    const order = (sp.get("order") as "desc" | "asc") || "desc";
    const since =
      (sp.get("since") as "daily" | "weekly" | "monthly") || undefined;
    const perPage = Math.min(Number(sp.get("perPage") || 30), 100);
    const page = Math.max(Number(sp.get("page") || 1), 1);

    const result = await searchRepos({
      query,
      language,
      topic,
      sort,
      order,
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
      {
        success: false,
        error: msg,
        items: [],
        total_count: 0,
        incomplete_results: false,
      },
      { status: 500 }
    );
  }
}

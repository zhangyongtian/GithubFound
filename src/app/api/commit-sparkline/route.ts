import { NextRequest, NextResponse } from "next/server";
import { getRepoCommitActivity } from "@/lib/github";
import { deleteCache } from "@/lib/cache";
import { applyReqSettings } from "@/lib/applyReqSettings";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    applyReqSettings(request);
    const sp = request.nextUrl.searchParams;
    const owner = sp.get("owner")?.trim();
    const repo = sp.get("repo")?.trim();
    const revalidate = sp.get("revalidate") !== null;

    if (!owner || !repo) {
      return NextResponse.json(
        { success: false, error: "owner/repo required", weeks: [] },
        { status: 400 }
      );
    }

    if (revalidate) deleteCache(`gh_commits:${owner}/${repo}`);

    const weeks = await getRepoCommitActivity(owner, repo);
    const total = weeks.reduce((acc, n) => acc + n, 0);
    const recent12 = weeks.slice(-12).reduce((acc, n) => acc + n, 0);

    return NextResponse.json({
      success: true,
      weeks,
      total,
      recent12,
      peak: weeks.reduce((acc, n) => Math.max(acc, n), 0),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "未知错误";
    return NextResponse.json(
      { success: false, error: msg, weeks: [], total: 0, recent12: 0, peak: 0 },
      { status: 200 }
    );
  }
}

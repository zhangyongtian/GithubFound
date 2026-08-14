import type { GithubRepo, RepoSearchParams, RepoSearchResult } from "./types";
import { withCache } from "./cache";

const GITHUB_API_BASE = "https://api.github.com";

function getHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-found-app",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function getDateSince(since?: "daily" | "weekly" | "monthly"): string {
  const now = new Date();
  switch (since) {
    case "daily":
      now.setDate(now.getDate() - 1);
      break;
    case "weekly":
      now.setDate(now.getDate() - 7);
      break;
    case "monthly":
      now.setMonth(now.getMonth() - 1);
      break;
    default:
      now.setDate(now.getDate() - 7);
  }
  return now.toISOString().split("T")[0];
}

export async function searchRepos(
  params: RepoSearchParams
): Promise<RepoSearchResult> {
  const {
    query = "",
    language,
    topic,
    sort = "stars",
    order = "desc",
    perPage = 30,
    page = 1,
    since,
  } = params;

  const cacheKey = `gh_search:${JSON.stringify(params)}`;

  return withCache(cacheKey, 600, async () => {
    const parts: string[] = [];

    if (query) parts.push(query);
    if (language) parts.push(`language:${language}`);
    if (topic) parts.push(`topic:${topic}`);
    if (since) parts.push(`pushed:>=${getDateSince(since)}`);
    if (parts.length === 0) parts.push("stars:>1000");

    const q = parts.join(" ");
    const url = `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=${order}&per_page=${perPage}&page=${page}`;

    const res = await fetch(url, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `GitHub API error ${res.status}: ${text || res.statusText}`
      );
    }

    return (await res.json()) as RepoSearchResult;
  });
}

export async function getTrendingRepos(
  params: RepoSearchParams
): Promise<RepoSearchResult> {
  const {
    language,
    topic,
    sort = "stars",
    perPage = 30,
    page = 1,
    since = "weekly",
  } = params;

  const cacheKey = `gh_trending:${JSON.stringify(params)}`;

  return withCache(cacheKey, 900, async () => {
    const parts: string[] = [];

    if (language) parts.push(`language:${language}`);
    if (topic) parts.push(`topic:${topic}`);

    const date = getDateSince(since);
    parts.push(`pushed:>=${date}`);
    parts.push("stars:>100");

    const q = parts.join(" ");
    const url = `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(q)}&sort=${sort}&order=desc&per_page=${perPage}&page=${page}`;

    const res = await fetch(url, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `GitHub API error ${res.status}: ${text || res.statusText}`
      );
    }

    return (await res.json()) as RepoSearchResult;
  });
}

export async function getRepo(
  owner: string,
  repo: string
): Promise<GithubRepo> {
  const cacheKey = `gh_repo:${owner}/${repo}`;
  return withCache(cacheKey, 1800, async () => {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
      throw new Error(`GitHub API error ${res.status}`);
    }
    return (await res.json()) as GithubRepo;
  });
}

export async function getRepoReadme(
  owner: string,
  repo: string
): Promise<string | null> {
  const cacheKey = `gh_readme:${owner}/${repo}`;
  return withCache(cacheKey, 3600, async () => {
    try {
      const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`;
      const res = await fetch(url, {
        headers: {
          ...getHeaders(),
          Accept: "application/vnd.github.raw+json",
        },
      });
      if (!res.ok) return null;
      const text = await res.text();
      return text || null;
    } catch {
      return null;
    }
  });
}

export async function getRepoCommitActivity(
  owner: string,
  repo: string,
  retries = 2
): Promise<number[]> {
  const cacheKey = `gh_commits:${owner}/${repo}`;
  return withCache(cacheKey, 3600 * 12, async () => {
    const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/stats/commit_activity`;
    for (let i = 0; i < Math.max(1, retries + 1); i++) {
      const res = await fetch(url, { headers: getHeaders() });
      if (res.status === 202) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!res.ok) return [];
      const arr = (await res.json()) as Array<{ total: number; days: number[] }>;
      if (!Array.isArray(arr) || arr.length === 0) return [];
      return arr.map((w) => Number(w.total) || 0).slice(-52);
    }
    return [];
  });
}

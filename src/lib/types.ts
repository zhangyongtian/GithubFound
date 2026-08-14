export type SINCE_VALUES = "daily" | "weekly" | "monthly";
export type SORT_VALUES = "stars" | "forks" | "updated" | "help-wanted-issues";

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  topics: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string;
  size: number;
  default_branch: string;
  owner: {
    login: string;
    avatar_url: string;
    html_url: string;
    type: string;
  };
  license: {
    key: string;
    name: string;
    spdx_id: string;
  } | null;
}

export interface RepoSearchParams {
  query?: string;
  language?: string;
  topic?: string;
  sort?: "stars" | "forks" | "updated" | "help-wanted-issues";
  order?: "desc" | "asc";
  perPage?: number;
  page?: number;
  since?: "daily" | "weekly" | "monthly";
}

export interface RepoSearchResult {
  total_count: number;
  incomplete_results: boolean;
  items: GithubRepo[];
}

export interface TrendingParams {
  language?: string;
  since?: "daily" | "weekly" | "monthly";
  spoken_language?: string;
}

export interface SummarizeRequest {
  owner: string;
  repo: string;
}

export interface SummarizeResponse {
  success: boolean;
  summary?: string;
  readme_snippet?: string;
  mode: "ai" | "fallback";
  error?: string;
}

export const LANGUAGES: { value: string; label: string; color: string }[] = [
  { value: "", label: "全部语言", color: "#64748b" },
  { value: "javascript", label: "JavaScript", color: "#f7df1e" },
  { value: "typescript", label: "TypeScript", color: "#3178c6" },
  { value: "python", label: "Python", color: "#3572A5" },
  { value: "java", label: "Java", color: "#b07219" },
  { value: "go", label: "Go", color: "#00ADD8" },
  { value: "rust", label: "Rust", color: "#dea584" },
  { value: "c", label: "C", color: "#555555" },
  { value: "cpp", label: "C++", color: "#f34b7d" },
  { value: "csharp", label: "C#", color: "#178600" },
  { value: "ruby", label: "Ruby", color: "#701516" },
  { value: "php", label: "PHP", color: "#4F5D95" },
  { value: "swift", label: "Swift", color: "#F05138" },
  { value: "kotlin", label: "Kotlin", color: "#A97BFF" },
  { value: "dart", label: "Dart", color: "#00B4AB" },
  { value: "vue", label: "Vue", color: "#41b883" },
  { value: "svelte", label: "Svelte", color: "#ff3e00" },
  { value: "shell", label: "Shell", color: "#89e051" },
  { value: "html", label: "HTML", color: "#e34c26" },
  { value: "css", label: "CSS", color: "#563d7c" },
  { value: "scala", label: "Scala", color: "#c22d40" },
  { value: "r", label: "R", color: "#198CE7" },
  { value: "lua", label: "Lua", color: "#000080" },
  { value: "haskell", label: "Haskell", color: "#5e5086" },
  { value: "elixir", label: "Elixir", color: "#6e4a7e" },
];

export const TOPICS: { value: string; label: string; emoji: string }[] = [
  { value: "", label: "全部分类", emoji: "📁" },
  { value: "ai", label: "AI / 机器学习", emoji: "🤖" },
  { value: "llm", label: "大语言模型 LLM", emoji: "🧠" },
  { value: "deep-learning", label: "深度学习", emoji: "🎯" },
  { value: "computer-vision", label: "计算机视觉", emoji: "👁️" },
  { value: "nlp", label: "自然语言处理", emoji: "💬" },
  { value: "web-framework", label: "Web 框架", emoji: "🌐" },
  { value: "frontend", label: "前端开发", emoji: "🎨" },
  { value: "backend", label: "后端开发", emoji: "⚙️" },
  { value: "mobile", label: "移动开发", emoji: "📱" },
  { value: "devops", label: "DevOps", emoji: "🚀" },
  { value: "cloud", label: "云计算", emoji: "☁️" },
  { value: "database", label: "数据库", emoji: "🗄️" },
  { value: "game", label: "游戏开发", emoji: "🎮" },
  { value: "security", label: "安全 / 渗透", emoji: "🔐" },
  { value: "cryptocurrency", label: "区块链 / Crypto", emoji: "💰" },
  { value: "data-science", label: "数据科学", emoji: "📊" },
  { value: "automation", label: "自动化工具", emoji: "🤖" },
  { value: "cli", label: "命令行工具", emoji: "💻" },
  { value: "documentation", label: "文档 / 教程", emoji: "📚" },
  { value: "awesome-list", label: "资源列表", emoji: "⭐" },
];

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "stars", label: "Stars 最多" },
  { value: "forks", label: "Forks 最多" },
  { value: "updated", label: "最近更新" },
  { value: "help-wanted-issues", label: "求贡献 issues" },
];

export const SINCE_OPTIONS: { value: string; label: string }[] = [
  { value: "daily", label: "今日热门" },
  { value: "weekly", label: "本周热门" },
  { value: "monthly", label: "本月热门" },
];

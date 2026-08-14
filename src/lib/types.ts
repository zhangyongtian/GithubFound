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
  { value: "llm-agent", label: "AI Agent 智能体", emoji: "🕹️" },
  { value: "rag", label: "RAG 知识库", emoji: "📚" },
  { value: "ai-coding", label: "AI 编程助手", emoji: "💡" },
  { value: "diffusion", label: "扩散模型 / 图像生成", emoji: "🎨" },
  { value: "speech", label: "语音 / TTS / ASR", emoji: "🎤" },
  { value: "embedding", label: "向量 / Embedding", emoji: "🧮" },
  { value: "web-framework", label: "Web 框架", emoji: "🌐" },
  { value: "frontend", label: "前端开发", emoji: "🎨" },
  { value: "backend", label: "后端开发", emoji: "⚙️" },
  { value: "mobile", label: "移动开发", emoji: "📱" },
  { value: "ui-components", label: "UI 组件库", emoji: "🧩" },
  { value: "react", label: "React 生态", emoji: "⚛️" },
  { value: "vue", label: "Vue 生态", emoji: "🟢" },
  { value: "nextjs", label: "Next.js 全栈", emoji: "▲" },
  { value: "admin-dashboard", label: "后台 / 管理系统", emoji: "📋" },
  { value: "low-code", label: "低代码 / 无代码", emoji: "🧱" },
  { value: "devops", label: "DevOps", emoji: "🚀" },
  { value: "cloud", label: "云计算", emoji: "☁️" },
  { value: "database", label: "数据库", emoji: "🗄️" },
  { value: "kubernetes", label: "Kubernetes / K8s", emoji: "☸️" },
  { value: "docker", label: "Docker 容器化", emoji: "🐳" },
  { value: "observability", label: "可观测性 / 监控", emoji: "📡" },
  { value: "cache", label: "缓存 / 中间件", emoji: "🗃️" },
  { value: "message-queue", label: "消息队列 / RPC", emoji: "📮" },
  { value: "api", label: "API 网关 / SDK", emoji: "🔌" },
  { value: "serverless", label: "Serverless 函数", emoji: "🪶" },
  { value: "data-science", label: "数据科学", emoji: "📊" },
  { value: "big-data", label: "大数据", emoji: "🧱" },
  { value: "etl", label: "ETL / 数据管道", emoji: "🛠️" },
  { value: "data-visualization", label: "数据可视化", emoji: "📈" },
  { value: "game", label: "游戏开发", emoji: "🎮" },
  { value: "security", label: "安全 / 渗透", emoji: "🔐" },
  { value: "cryptocurrency", label: "区块链 / Crypto", emoji: "💰" },
  { value: "iot", label: "物联网 IoT", emoji: "🔌" },
  { value: "robotics", label: "机器人 / 硬件", emoji: "🦾" },
  { value: "3d", label: "3D / WebGL / 图形学", emoji: "🧊" },
  { value: "design-system", label: "设计系统 / 设计资源", emoji: "🎯" },
  { value: "video", label: "音视频 / 直播", emoji: "🎬" },
  { value: "payment", label: "支付 / 电商", emoji: "💳" },
  { value: "cms", label: "CMS / 博客", emoji: "📝" },
  { value: "static-site", label: "静态站点生成", emoji: "🏗️" },
  { value: "networking", label: "网络 / 代理 / VPN", emoji: "🕸️" },
  { value: "automation", label: "自动化工具", emoji: "🦾" },
  { value: "cli", label: "命令行工具", emoji: "💻" },
  { value: "documentation", label: "文档 / 教程", emoji: "📖" },
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

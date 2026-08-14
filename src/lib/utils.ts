export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}个月前`;
  const yr = Math.floor(day / 365);
  return `${yr}年前`;
}

export function langColor(lang: string | null): string {
  const map: Record<string, string> = {
    javascript: "#f7df1e",
    typescript: "#3178c6",
    python: "#3572A5",
    java: "#b07219",
    go: "#00ADD8",
    rust: "#dea584",
    c: "#555555",
    "c++": "#f34b7d",
    "c#": "#178600",
    ruby: "#701516",
    php: "#4F5D95",
    swift: "#F05138",
    kotlin: "#A97BFF",
    dart: "#00B4AB",
    vue: "#41b883",
    svelte: "#ff3e00",
    shell: "#89e051",
    html: "#e34c26",
    css: "#563d7c",
    scala: "#c22d40",
    r: "#198CE7",
    lua: "#000080",
    haskell: "#5e5086",
    elixir: "#6e4a7e",
  };
  if (!lang) return "#94a3b8";
  return map[lang.toLowerCase()] || "#94a3b8";
}

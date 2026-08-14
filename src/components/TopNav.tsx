"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

type NavItem = {
  href: string;
  label: string;
  emoji: string;
  hint: string;
  match: (pathname: string, href: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "热门项目",
    emoji: "🔥",
    hint: "每日/每周 GitHub Trending",
    match: (p, h) => p === "/" || p.startsWith("/page"),
  },
  {
    href: "/search",
    label: "分类搜索",
    emoji: "🔎",
    hint: "关键词 + 语言/分类 + 时间筛选",
    match: (p) => p.startsWith("/search"),
  },
  {
    href: "/trending",
    label: "风向标",
    emoji: "🧭",
    hint: "AI 提炼热门方向 + 飙升榜",
    match: (p) => p.startsWith("/trending"),
  },
];

export default function TopNav() {
  const pathname = usePathname() || "/";
  const activeIndex = useMemo(() => {
    const i = NAV_ITEMS.findIndex((n) => n.match(pathname, n.href));
    return i < 0 ? -1 : i;
  }, [pathname]);
  const isSettings = pathname === "/settings";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          scroll={false}
          className="group inline-flex items-center gap-2.5"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-lg font-black text-white shadow-md shadow-indigo-500/20">
            G
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              GithubFound
            </span>
            <span className="text-[10.5px] font-medium text-zinc-500 dark:text-zinc-400">
              GitHub 寻宝 · AI 中文总结
            </span>
          </div>
        </Link>

        <nav className="flex flex-1 items-center justify-center px-2">
          <ul className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            {NAV_ITEMS.map((n, i) => {
              const active = i === activeIndex;
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    scroll={false}
                    title={n.hint}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:py-2 sm:text-[13px] ${
                      active
                        ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25"
                        : "text-zinc-600 hover:bg-white hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                    }`}
                  >
                    <span className="sm:mr-0.5">{n.emoji}</span>
                    <span>{n.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="inline-flex shrink-0 items-center gap-2">
          <Link
            href="/settings"
            scroll={false}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-colors ${
              isSettings
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30"
                : "border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            }`}
            title="配置 GitHub Token & LLM API Key（只存在浏览器本地）"
          >
            <span>⚙</span> <span className="hidden sm:inline">设置</span>
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:inline-flex"
          >
            <span>🐙</span> GitHub
          </a>
        </div>
      </div>
    </header>
  );
}

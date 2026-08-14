"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

export default function ModeTabs() {
  const pathname = usePathname();
  const sp = useSearchParams();

  const withQS = (base: string) => {
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };

  const tabs = [
    {
      name: "热门项目",
      href: withQS("/"),
      icon: "🔥",
      desc: "GitHub 近期飙升项目",
      active: pathname === "/",
    },
    {
      name: "分类搜索",
      href: withQS("/search"),
      icon: "🔍",
      desc: "按条件精准搜索",
      active: pathname === "/search",
    },
    {
      name: "开源风向标",
      href: withQS("/trending"),
      icon: "🧭",
      desc: "AI 提炼技术方向 + 飙升榜",
      active: pathname.startsWith("/trending"),
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          scroll={false}
          className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
            t.active
              ? "border-indigo-500 bg-gradient-to-br from-indigo-50 to-violet-50 shadow-lg shadow-indigo-500/10 dark:from-indigo-500/10 dark:to-violet-500/10 dark:border-indigo-500/50"
              : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/30 dark:hover:border-zinc-700"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="text-3xl">{t.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-base font-bold ${
                    t.active
                      ? "text-indigo-700 dark:text-indigo-300"
                      : "text-zinc-900 dark:text-zinc-100"
                  }`}
                >
                  {t.name}
                </span>
                {t.active && (
                  <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    当前
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {t.desc}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { attachSettingsHeaders } from "@/lib/clientSettings";

type Props = {
  fullName: string;
  width?: number;
  height?: number;
};

type Resp = {
  success?: boolean;
  weeks: number[];
  total: number;
  recent12: number;
  peak: number;
};

function normalizeWeeks(weeks: number[]): number[] {
  if (weeks.length === 0) return weeks;
  const padded = weeks.length >= 52 ? weeks : Array(52 - weeks.length).fill(0).concat(weeks);
  return padded.slice(-52);
}

export default function ActivitySparkline({ fullName, width = 160, height = 56 }: Props) {
  const [state, setState] = useState<{ data?: Resp; loading: boolean }>({ loading: true });

  useEffect(() => {
    let alive = true;
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) {
      setState({ loading: false });
      return;
    }
    setState({ loading: true });
    const qs = new URLSearchParams({ owner, repo });
    fetch(`/api/commit-sparkline?${qs.toString()}`, attachSettingsHeaders({}))
      .then((r) => (r.ok ? r.json() : Promise.resolve({ weeks: [], total: 0, recent12: 0, peak: 0 })))
      .then((d: Resp) => {
        if (alive) setState({ data: d, loading: false });
      })
      .catch(() => {
        if (alive) setState({ loading: false });
      });
    return () => {
      alive = false;
    };
  }, [fullName]);

  const weeks = useMemo(() => normalizeWeeks(state.data?.weeks || []), [state.data]);
  const total = state.data?.total || 0;
  const recent12 = state.data?.recent12 || 0;

  const { pathLine, pathArea, level } = useMemo(() => {
    if (weeks.length === 0) return { pathLine: "", pathArea: "", level: "冷" as const };
    const padX = 2;
    const padY = 4;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const max = Math.max(1, ...weeks);
    const pts = weeks.map((v, i) => {
      const x = padX + (i / (weeks.length - 1)) * innerW;
      const y = padY + innerH - Math.sqrt(v / max) * innerH;
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${(height - 1).toFixed(1)} L${pts[0][0].toFixed(1)},${(height - 1).toFixed(1)} Z`;
    const avg = total / weeks.length;
    const activeWeeks = weeks.filter((n) => n > 0).length;
    let lvl: "冷" | "温" | "热" = "冷";
    if (activeWeeks >= 26 && recent12 >= 5) lvl = "热";
    else if (activeWeeks >= 10 || recent12 >= 2) lvl = "温";
    return { pathLine: line, pathArea: area, level: lvl };
  }, [weeks, total, recent12, width, height]);

  const levelColor =
    level === "热" ? "text-emerald-600 dark:text-emerald-400" :
    level === "温" ? "text-amber-600 dark:text-amber-400" :
    "text-zinc-400 dark:text-zinc-500";
  const levelBg =
    level === "热" ? "bg-emerald-500/10 ring-emerald-200/70 dark:ring-emerald-500/20" :
    level === "温" ? "bg-amber-500/10 ring-amber-200/70 dark:ring-amber-500/20" :
    "bg-zinc-100 ring-zinc-200/60 dark:bg-zinc-800 dark:ring-zinc-700";

  const tip = useMemo(() => {
    if (!state.data || weeks.length === 0) return "暂无 commit 活跃度数据";
    return `最近一年共 ${total} 次提交，活跃 ${weeks.filter(n => n > 0).length}/52 周 · 近 3 月 ${recent12} 次 · 单周峰值 ${state.data.peak || 0}`;
  }, [state.data, weeks, total, recent12]);

  return (
    <div
      className="flex shrink-0 flex-col items-center gap-1.5"
      style={{ width }}
      title={tip}
    >
      <div
        className={`relative flex items-center justify-center rounded-2xl px-2.5 py-2 ring-1 ${levelBg}`}
        style={{ height: height + 16 }}
      >
        <div
          className="relative overflow-hidden rounded-lg"
          style={{ width: width - 20, height }}
        >
          {state.loading || weeks.length === 0 ? (
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id={`spark-skel-${fullName}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#e4e4e7" stopOpacity="0.5" />
                  <stop offset="50%" stopColor="#f4f4f5" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#e4e4e7" stopOpacity="0.5" />
                </linearGradient>
              </defs>
              <path
                d={`M0,${height - 4} L${width},${height - 4}`}
                stroke={`url(#spark-skel-${fullName})`}
                strokeWidth="3"
                strokeLinecap="round"
                className="animate-pulse"
              />
            </svg>
          ) : (
            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id={`spark-area-${fullName}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.38" />
                  <stop offset="60%" stopColor="#34d399" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id={`spark-line-${fullName}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#059669" />
                  <stop offset="50%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#14b8a6" />
                </linearGradient>
              </defs>
              <path d={pathArea} fill={`url(#spark-area-${fullName})`} />
              <path
                d={pathLine}
                fill="none"
                stroke={`url(#spark-line-${fullName})`}
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>
      <div className="flex w-full items-center justify-between gap-1 px-1 text-[10px] font-medium leading-none">
        <span className={`flex items-center gap-1 truncate ${levelColor}`}>
          {weeks.length === 0 ? "— 无数据" : level === "热" ? "🔥 长期活跃" : level === "温" ? "🌱 稳定维护" : "🧊 偶尔更新"}
        </span>
        <span className="shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">
          {weeks.length === 0 ? "0/52w" : `${weeks.filter((n) => n > 0).length}/52w`}
        </span>
      </div>
    </div>
  );
}

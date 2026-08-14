import { Suspense } from "react";
import { Metadata } from "next";
import SettingsForm from "@/components/SettingsForm";

export const metadata: Metadata = {
  title: "大模型 API Key 设置 · GithubFound",
  description: "配置 GitHub Token 和大模型 API Key。所有信息仅保存在你当前浏览器的 localStorage，不会上传，安全可控。",
};

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:border-zinc-800 dark:from-zinc-900/60 dark:via-zinc-900/20 dark:to-indigo-500/10">
        <div className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600/95 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm shadow-indigo-900/20">
            ⚙️ 大模型 API Key 设置中心
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            配置 GitHub Token 与大模型 API Key
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            🔐 <b className="text-emerald-700 dark:text-emerald-300">所有配置仅保存在你当前浏览器的 localStorage，不会存储到后端，也不会上传第三方。</b>
            优先使用你本机填写的 Key；未填写时会回退到服务器端 .env.local 预先配置的值。
          </p>
        </div>
      </section>

      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-28 animate-pulse rounded-3xl bg-zinc-100" />
            <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />
          </div>
        }
      >
        <SettingsForm />
      </Suspense>
    </div>
  );
}

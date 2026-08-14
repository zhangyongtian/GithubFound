
<div align="center">
  <a href="https://github.com/zhangyongtian/GithubFound">
    <img src="./assets/logo.svg" alt="GithubFound Logo" width="110" height="110" style="border-radius:26px;box-shadow:0 10px 30px rgba(139,92,246,.35)"/>
  </a>

  <h1 align="center"><a href="https://github.com/zhangyongtian/GithubFound">GithubFound · GitHub 寻宝</a></h1>

  <p align="center">
    <b>发现 GitHub 每日热门项目，AI 中文总结 · 风向分析 · 魔法棒智能搜索，多模型一键切换开箱即用。</b>
  </p>
  <p align="center">
    Next.js 16 + App Router · Server Actions · Tailwind · 100% 纯前端 Key 本地存储
  </p>

  <p align="center">
    <a href="https://github-found.vercel.app/"><img src="https://img.shields.io/badge/🏠%20在线体验-Vercel%20已部署-000?style=for-the-badge&logo=vercel&logoColor=white&labelColor=6366F1" /></a>
    &nbsp;
    <a href="#-功能亮点"><img src="https://img.shields.io/badge/✨%20AI%20中文总结-8B5CF6?style=for-the-badge&logoColor=white" /></a>
    &nbsp;
    <a href="#-配置llm"><img src="https://img.shields.io/badge/🧠%208家模型-D946EF?style=for-the-badge&logoColor=white" /></a>
    &nbsp;
    <a href="#%EF%B8%8F-部署"><img src="https://img.shields.io/badge/▲%20一键%20Deploy-000?style=for-the-badge&logo=vercel&logoColor=white" /></a>
  </p>
  <p align="center">
    <a href="https://github.com/zhangyongtian/GithubFound/stargazers"><img src="https://img.shields.io/github/stars/zhangyongtian/GithubFound?style=social" alt="Stars" /></a>
    &nbsp;
    <a href="https://github.com/zhangyongtian/GithubFound/issues"><img src="https://img.shields.io/github/issues/zhangyongtian/GithubFound?style=social" alt="Issues" /></a>
    &nbsp;
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=social" alt="License" /></a>
  </p>
</div>

---

## ✨ 功能亮点

### 🔥 三页独立导航，清爽不拥挤
| 页面 | 路由 | 作用 |
|---|---|---|
| 🔥 **热门项目** | `/` | 每日 / 每周 / 每月 21 条 GitHub Trending，带 Superstar / Top Stars / 近期活跃 / 精准命中 4 色快速识别标签 |
| 🔎 **分类搜索** | `/search` | 语言 + Topic + 排序组合筛选，**✨ 魔法棒 AI 重写中文描述成英文 GitHub 搜索词** + 本月热门方向智能推荐 chip |
| 🧭 **风向标** | `/trending` | 综合近 24h / 7d / 30d 样本 → AI 提炼「总体判断 + 趋势榜 3-8 条 + 开发者建议」+ Top 语言 / Top Topics 条形图 + 飙升榜 Top3 |

### 🧠 AI 三件套，Key 本地保存超安全
1. **项目一键中文总结**：每个项目卡片点「🧠 中文总结」，AI 拆成 "这是干嘛的 / 亮点列表 / 适用场景" 三段式卡片；失败自动降级为 README 摘要（可重试点再跑）。
2. **✨ 魔法棒搜索重写**：输入中文（如"yolov 目标检测"）→ 点魔法棒 → AI 重写成 GitHub 真正匹配的英文布尔查询（`yolov* OR yolov8 OR "object detection"`），**只填输入框不跳页**，你确认之后再点搜索。
3. **🧭 开源风向标总结**：风向卡根据 21 个样本自动生成"总体判断 + 3-8 条趋势方向（每条 2-4 个代表项目）+ 开发者建议"，配合 since 切 URL 同步刷新。

### 🎛️ 8 档模型切换 + 默认免费兜底
在 `/settings`（⚙ 设置页）可选 8 档：
```
自动优先级  →  🆓 Agnes（默认免费，开箱即用）
          →  🤖 阿里 千问 DashScope
          →  🌌 DeepSeek
          →  🧠 OpenAI / 任意兼容 GPT（可填中转 BaseURL）
          →  🟣 Anthropic Claude
          →  💎 Google Gemini
          →  🛰 OpenRouter 多模型聚合
```
- 所有 Key **只保存到当前浏览器 localStorage**，顶部黄色卡会明确提示"不上传后端，用完即丢"，点击 🛰「检测可用模型」立即看到 `来源：本机浏览器 / 服务器 env / 未配置`。
- 就算你不填任何 Key 也能用：**Agnes 聚合默认免费 Key** 写在 `src/lib/llm.ts` 里兜底，clone 下来直接跑就能出 AI 总结。

### 🔐 本地 Key 即开即用（安全架构）
```
 浏览器 ──fill──▶  /settings  ──save──▶  localStorage[githubfound-settings:v1]
    │
    │  fetch(`/api/*`
    │  header: x-gf-settings = btoa(JSON.stringify(map))
    ▼
 Next Server ──applyReqSettings──▶  临时覆盖当前请求 process.env
    │                                   ▲ 使用完立刻丢弃，不写磁盘
    └──▶  调 GitHub / LLM 官方接口
```

---

## 🖼️ 截图

> 💡 等 Vercel 发布完，把截图放到仓库 `docs/home.png` `docs/search.png` `docs/insight.png`，然后把下面三行替换成 `![](docs/home.png)` 即可。

| 🔥 热门项目页 | 🔎 分类搜索 + 魔法棒 | 🧭 风向标 AI 分析 |
|---|---|---|
| ![](https://img.shields.io/badge/%F0%9F%94%A5%20Trending%20Page-截图待补充-6366F1?style=for-the-badge) | ![](https://img.shields.io/badge/%F0%9F%94%8E%20Magic%20Search-截图待补充-10B981?style=for-the-badge) | ![](https://img.shields.io/badge/%F0%9F%A7%AD%20AI%20Insight-截图待补充-D946EF?style=for-the-badge) |

---

## 🚀 快速开始

> 🌟 **直接体验：[https://github-found.vercel.app/](https://github-found.vercel.app/)**（Vercel 已部署，打开即用）
>
> 要求 Node.js ≥ **18.17**（Next.js 16 要求），推荐 **Node 20 LTS**。

```bash
# 1. 克隆
git clone https://github.com/zhangyongtian/GithubFound.git
cd githubfound

# 2. 安装依赖（npm / pnpm / yarn / bun 都可以）
npm install

# 3. （可选）拷贝环境变量，不拷贝也能用——Agnes 默认免费 Key 已经写死在代码里
cp .env.example .env.local

# 4. 启动开发服务器，默认 http://localhost:3000
npm run dev
```

生产构建：
```bash
npm run build
npm run start
```

---

## 🔧 配置 LLM

`.env.local`（或 `/settings` 设置页直接填，本地保存不进服务器）：

```env
# ========== GitHub Token（可选）==========
# 不填：限流 60 次 / 小时
# 填 1 个： 5000 次 / 小时（推荐！个人项目访问量大才需要）
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxx

# ========== LLM：按优先级从上到下 ==========
# （填了哪个就用哪个；都不填自动走下面 Agnes 默认免费）

# 🆓 1. Agnes 聚合（默认免费，开箱即用，Key 是公开免费的可以直接复制用）
AGNES_API_KEY=sk-Qfal9xUmJOVLppj64WEbaq9oD4rachChk8li7R44YdPpMIF6
AGNES_MODEL=agnes-2.0-flash
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1

# 🤖 2. 千问 DashScope（国内稳定，阿里云 API 网关）
DASHSCOPE_API_KEY=
DASHSCOPE_MODEL=qwen-plus
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 🌌 3. DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# 🧠 4. OpenAI / 任意兼容 GPT 中转
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1    # 或填你自己的中转

# 🟣 5. Anthropic Claude
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-haiku-latest

# 💎 6. Google Gemini（Google AI Studio 免费 Key 就能用）
GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-2.0-flash

# 🛰 7. OpenRouter 多模型聚合
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openai/gpt-4o-mini
```

> 更推荐的做法：**环境变量只填 GitHub Token（或全部留空）**，浏览器直接打开站点右上角点 ⚙ 设置，在里面填 Key，所有 Key 存本地不会被 Git commit 进去。

---

## ⚙️ 设置页说明

地址：`/settings`

1. **🎛️ 选择生效模型服务商**：选「自动」就按上面的优先级；选「DeepSeek」就强制走 DeepSeek，哪怕你 Agnes 也填了 Key。
2. **🛰 检测可用模型**：点一下直接跑当前请求，返回 "Provider / Model / 选择方式（自动 or 手动）/ 来源（本机浏览器 or 服务器 .env.local）"。
3. **💾 保存配置**：存到 `localStorage[githubfound-settings:v1]`，**刷新浏览器就生效**，不用重启 Node 后端。
4. **🗑 清空本机**：清掉所有 Key，但会自动恢复「🆓 Agnes 默认免费版」，保证清完依然能用 AI。

---

## 🧱 技术栈

| 层 | 选型 | 位置 |
|---|---|---|
| 框架 | **Next.js 16（App Router）** | [src/app/](./src/app/) |
| UI | React 19 + Tailwind + Geist 字体 | [src/components/](./src/components/) |
| LLM 多模型适配 | 手写 `callOpenAI / callAnthropic / callGoogle / callOpenRouter` | [src/lib/llm.ts](./src/lib/llm.ts) |
| GitHub 数据源 | `@octokit` 原生 REST（无第三方） | [src/lib/github.ts](./src/lib/github.ts) |
| 进程内缓存（防止重复调 AI）| 自研 `withCache` + `deleteCache`（Lazy Map TTL） | [src/lib/cache.ts](./src/lib/cache.ts) |
| 本地 Key 安全透传 | `encodeSettingsHeader` + `applyReqSettings(request)` 覆盖 env | [clientSettings](./src/lib/clientSettings.ts) / [applyReqSettings](./src/lib/applyReqSettings.ts) |
| API Route | 6 条：`ai-status / summarize / rewrite-query / trending-insight / github/trending / github/search` + `hot-suggestions` | [src/app/api/](./src/app/api/) |

---

## ☁️ 部署（Vercel 免费）

项目是 **纯 Next.js App Router + Node runtime**，最推荐 [Vercel 一键部署](https://vercel.com)（免费额度对个人站、朋友分享完全够用）。

### 方式 1：Vercel 网页 3 步
1. 把本项目 push 到你自己的 GitHub 仓库；
2. 打开 <https://vercel.com/new> → Import Repo → 选中 githubfound；
3. Framework 自动识别为 **Next.js**，Environment Variables 可留空（默认走 Agnes 免费 Key）→ 点 **Deploy**。

### 方式 2：命令行
```bash
npm i -g vercel
vercel login
vercel          # 首次部署（会自动问关联哪个 GitHub 仓库）
vercel --prod   # 之后的生产部署
```

### 其它免费部署选项
- **Netlify**：Next.js 通过 Essential Next.js Plugin 同样一键发布；
- **Cloudflare Pages**（免费 Workers 路由）：Hobby 档支持 Node 兼容模式；
- **Railway / Render**：免费 500 小时 / 月足够个人试用。

> ✅ **已发布示例：** [https://github-found.vercel.app/](https://github-found.vercel.app/)
>
> 直接 Fork 本仓库 → Vercel Import → 留空 Environment Variables（用 Agnes 默认免费 Key）→ 点 Deploy 即可得到你自己的同款站点。
>
> ⚠️ 不管哪种部署方式，**GitHub 搜索和 LLM 都是从 Server 端发起外网请求**，请遵守对应平台免费额度限制；Key 建议用本地 localStorage 设置不要硬编码到 CI。

---

## 🤝 贡献

```bash
git checkout -b feature/your-feature
npm run dev   # 本地改完浏览器看效果
npm run build # 提交前确认 build 全通过
```

欢迎提：
- [x] Feature Issue（新想法、更多模型适配）
- [x] Bug Report（附带浏览器 + 控制台截图）
- [x] 新增一个模型服务商（参考 [src/lib/llm.ts](src/lib/llm.ts) 的 `case "agnes"`，新增一个 `case "xxx"` + Provider 配置即可）

---

## 📄 许可证

[MIT License](./LICENSE) © GithubFound

---

<div align="center">
  <br />
  觉得有用就给个 ⭐ Star，会让我更有动力更新方向分析算法 💜
  <br />
  Made with 🟣 indigo + 🤖 AI 中文总结 + 🧭 开源风向标
</div>

# Kirikira.moe 迁移与重构方案（Django → Astro on Cloudflare Workers）

> **实现说明（2026-10-22，与下文原计划的差异）**
> - 实际使用 **Astro 7**（写计划时以为最新是 6）+ `@astrojs/cloudflare` 14；Markdown 由 Astro 7 默认的 Sätteri 处理，
>   开启了 subscript 以还原 pymdownx.tilde 的 `~下标~`。
> - 工作量证明只用 `altcha-lib`（服务端签发/校验 + 浏览器求解，均为 WebCrypto），不引入 ALTCHA 的 UI 组件；签名挑战同时充当表单令牌和时间陷阱。
> - 迁移文章的评论线程 id 用 `legacyId`（而非可被 CMS 改动的 `cid`），新文章用 CMS 生成的 uuid。
> - 评论状态只有 `published` / `spam` 两种，删除即物理删除；没有做邮件通知（可后续用 Email Routing 的 `send_email` 绑定加上）。
> - 执行步骤以 [MIGRATION_RUNBOOK.md](MIGRATION_RUNBOOK.md) 为准。

## Context

旧站是 2018 年的 Django 1.11 + SQLite + uWSGI/nginx 博客：`blog`（Post/Category/Tag，Python‑Markdown + pymdownx 渲染）、`comments`（name/email/url/text，唯一反垃圾是拒绝含 `</a>` 的评论）、`aplayer`（每篇文章可挂一首歌）。真实数据只在线上 `db.sqlite3` 里（已 gitignore，用户手上有）；仓库里的 `articles-md/` 是 30 篇无元数据的导出稿，正文图片 ~66 张托管在第三方图床 `i.yusa.me`。旧站还注册过一个缓存 `/` 的 Service Worker（`templates/sw/sw.js`）。

目标：
1. 文章/评论/元数据全量迁出，旧链接不失效；
2. 免费托管在 Cloudflare Workers；
3. **不需要本地编译**就能写/改文章（浏览器里编辑即可上线）；
4. 评论区自己掌控（自己的数据库），免注册，**不接入任何第三方验证码**，按规则静默过滤垃圾：发送者看到“成功”，但公开页面不显示，站长可在后台事后删除/恢复；
5. 视觉上复刻旧主题风格（横幅、卡片、侧栏），用现代 CSS 重写，去掉 jQuery/Materialize。

## 技术选型（已调研后替你选定）

| 层 | 选择 | 理由 |
|---|---|---|
| 框架 | **Astro 6** + `@astrojs/cloudflare`（v14） | Cloudflare 2026 年收购 Astro，Astro 6 的 dev server 直接跑 workerd，部署到 Workers 是一等公民；文章页预渲染为静态资源（静态资源请求在 Workers 免费且不计次数），评论走同一个 Worker 的动态路由 |
| 文章存储 | **Markdown + front matter 存在 GitHub 仓库** | 可移植、有版本历史、零数据库读取 |
| 在线编辑 | **Sveltia CMS**（挂在 `/admin/`，GitHub 登录或个人 PAT） | 浏览器里编辑 Markdown、实时预览、上传图片，保存即 commit |
| 构建发布 | **Cloudflare Workers Builds**（连接 GitHub，push 自动构建部署） | 云端构建，本地零编译；保存后约 1–2 分钟上线；非 main 分支自动生成预览 URL |
| 评论数据 | **Cloudflare D1** | 自己的 SQLite，免费额度（5M 行读/天、100k 写/天）远超个人博客需求 |
| 后台鉴权 | **Cloudflare Access**（Zero Trust 免费 ≤50 人）保护 `/admin/*`、`/api/admin/*`，Worker 内再校验 `Cf-Access-Jwt-Assertion` | 不用自己写登录 |
| 代码高亮 | Astro 内置 Shiki | 替代 Pygments |
| 站内搜索（可选） | Pagefind | 构建时生成静态索引，零运行成本 |

**已考虑但不选**：
- Cloudflare **EmDash**（基于 Astro 的 CMS，D1+R2，9 月刚发 1.0）：正文存为 Portable Text（非 Markdown，旧文的 pymdownx 语法转换有损）、管理界面尚不成熟、版本迭代破坏性变更多，对 30 篇文章的个人博客收益不抵风险。
- 文章存 D1 + 自建后台：需自己写编辑器与媒体管理，且与平台绑定更深；Git+CMS 方案“保存→上线”只多 1 分钟，换来版本历史和可移植性。

## 仓库结构

在分支 `claude/gifted-curie-rmv63m` 上：`git mv` 旧 Django 代码到 `legacy/`（保留历史和参考），新站在根目录。

```
legacy/                      # 原 Django 项目（只读参考）
data/                        # gitignored：放 db.sqlite3 与迁移中间产物（含评论者邮箱，绝不提交）
scripts/migrate/
  export-posts.ts            # SQLite → src/content/posts/*.md
  export-comments.ts         # SQLite → data/comments.sql（直接 wrangler d1 execute，不提交）
  fetch-images.ts            # 下载正文外链图片 → public/uploads/legacy/，失效则回退 Wayback id_ 原图
  gen-redirects.ts           # 生成 public/_redirects（分类等旧 URL 301）
  verify.ts                  # 数量/链接/图片/评论对账
migrations/0001_comments.sql # D1 schema（wrangler d1 migrations）
src/
  content.config.ts          # posts 集合 schema（zod）
  content/posts/*.md
  layouts/{Base,Post}.astro
  components/{Banner,Header,Sidebar,PostCard,Pagination,APlayer,Comments,CommentForm}.astro
  pages/
    index.astro, page/[n].astro, post/[slug].astro,
    category/[slug].astro, tag/[slug].astro, archives.astro, 404.astro,
    rss.xml.ts, rss/index.ts(同内容，兼容旧 /rss/), sw.js.ts(kill-switch)
    api/comments.ts          # GET 列表+表单令牌 / POST 提交（prerender=false）
    api/admin/comments.ts    # 删除/标记/恢复/加规则（prerender=false）
    admin/comments.astro     # 评论管理页（SSR）
  lib/{spam.ts, comments.ts, markdown-comment.ts, access.ts}
public/admin/{index.html,config.yml}   # Sveltia CMS
public/{favicon.ico,img/...,uploads/...}
wrangler.jsonc               # Worker、assets、D1 binding、cron、secrets 声明
```

## 一、数据迁移（一次性，`data/db.sqlite3` 为唯一数据源）

脚本用 TypeScript + Node 24 内置 `node:sqlite`，无额外依赖。读表：`blog_post`、`blog_category`、`blog_tag`、`blog_post_tags`、`comments_comment`、`aplayer_player`、`auth_user`。

**文章 → `src/content/posts/<slug>.md`**
```yaml
---
id: "12"              # 稳定 ID，评论按此关联（旧文=旧 pk；新文由 CMS uuid 生成）
title: ...
slug: "12"            # 旧文默认沿用 pk ⇒ URL 仍是 /post/12/，零重定向
date: 2018-02-08T12:55:00+08:00
updated: ...
category: 技术
tags: [Linux, V2Ray]
excerpt: ...
draft: false          # status=draft → true
music: { title, author, url, pic }   # 来自 aplayer_player，可空
---
```
- **URL 策略**：文章保持 `/post/<slug>/` 前缀；旧文 slug=旧 pk，所以旧链接原样可用；新文用英文 slug。以后想给旧文改可读 slug，只需加一行 `_redirects`。
- **正文语法转换**（旧渲染：superfences / betterem / tilde / inlinehilite / details / footnotes / downheader(levels=2)）：
  - 脚本先统计 `??? `/`???+`（details）、`` `#!lang `` / `` `:::lang `` （inlinehilite）、`~~`、脚注的使用情况并打印清单；
  - `??? 标题` 块 → `<details><summary>`；inlinehilite → 普通行内代码；`~~x~~`、脚注由 remark-gfm 原生支持；
  - downheader：正文里 `#` 在旧站渲染为 h3，迁移时把正文标题统一降一级（`#`→`##`），页面标题为 h1；
  - 用 `legacy/articles-md/` 与旧站渲染结果做抽样比对（`verify.ts` 输出差异）。
- **图片**：扫描所有正文的图片 URL（主要 `i.yusa.me`），下载到 `public/uploads/legacy/<hash>.<ext>` 并改写链接；失败的尝试 `web.archive.org/web/0id_/<url>`，仍失败的列入报告。Sveltia 的 `media_folder` 也指向 `public/uploads/`，新图同样进仓库。
- **APlayer 音乐**：外链 URL 保留，`verify.ts` 检测可用性并报告失效项（版权原因不做镜像）。

**评论 → D1**：生成 `data/comments.sql`（`legacy_id` 保留原 pk、`created_at` 保留原时间、`status='published'`、`post_id`=文章 id），用 `wrangler d1 execute kirikira --remote --file data/comments.sql` 导入；文件不入库。

**分类/标签/其它旧路由**：`gen-redirects.ts` 生成 `public/_redirects`：`/category/<pk>/ → /category/<name-slug>/ 301`；`/page/N/` 分页路径新站保持一致；`/rss/` 与 `/rss.xml` 同时提供；`/sitemap.xml` 由 `@astrojs/sitemap` 生成（若生成的是 sitemap-index，再加一条重定向）；`/admine/` 直接 404。

## 二、新站前端（复刻旧主题）

- 参照 `legacy/templates/base.html`、`blog/index.html`、`blog/detail.html` 和 `legacy/blog/static/css/*.css` 抽取：配色、横幅（`banner*.jpg`、`kiri.mp4/webp` 头像动画）、卡片式文章列表、侧栏组件（最近文章 / 归档 / 分类，对应 `blog_tags.py` 的三个 tag）、页脚。
- 用原生 CSS（CSS 变量 + 容器查询 + `prefers-color-scheme` 暗色）重写，去掉 jQuery、Materialize、masonry；字体用 Fontsource 自托管，不再走 Google Fonts。
- 每页 10 篇分页（同旧 `index` 视图）；文章页：Shiki 高亮（主题接近旧 `github.css`）、外链新标签打开（替代 `markdown_newtab`，用 rehype-external-links）、APlayer 组件（npm `aplayer` 本地打包、`client:visible` 懒加载，仅 `music` 存在时加载）。
- RSS：`@astrojs/rss`，最近 20 篇，标题格式 `[分类] 标题`，与旧 `rss.py` 一致。
- **旧 Service Worker 清理（关键）**：`/sw.js` 返回 kill-switch 脚本（`install` 时 `skipWaiting`，`activate` 时删除所有 caches、`registration.unregister()`、刷新已控制的页面），否则老访客会一直看到缓存的旧首页。`_headers` 里给 `/sw.js` 设 `Cache-Control: no-cache`。

## 三、自托管评论系统（无第三方验证码）

**D1 schema**（`migrations/0001_comments.sql`）
```sql
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id TEXT NOT NULL,
  parent_id INTEGER REFERENCES comments(id),   -- 一级楼中楼回复
  name TEXT NOT NULL, email TEXT, url TEXT,
  body TEXT NOT NULL,                          -- 原始 Markdown 文本
  status TEXT NOT NULL DEFAULT 'published',    -- published | spam
  spam_score INTEGER NOT NULL DEFAULT 0,
  spam_reasons TEXT,                           -- JSON 数组，后台显示命中原因
  ip_hash TEXT, user_agent TEXT,               -- IP 只存 HMAC(盐, ip)
  created_at TEXT NOT NULL,
  legacy_id INTEGER UNIQUE
);
CREATE INDEX idx_comments_post ON comments(post_id, status, created_at);
CREATE TABLE spam_rules (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,          -- keyword | domain | regex | ip_hash | email
  pattern TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL
);
```

**读取**：`GET /api/comments?post=<id>` 返回 `status='published'` 的评论（服务端用 markdown-it `html:false, linkify:true` 渲染，链接加 `rel="nofollow ugc noopener"`，邮箱永不输出），并附一个**表单令牌** `HMAC(SECRET, post_id|issued_at|nonce)`。评论区组件在文章页底部用 `client:visible` 加载，因此文章本身仍是纯静态页。

**提交管线** `POST /api/comments`（`src/lib/spam.ts`，纯函数、可单测）：
1. **格式校验**（唯一会返回 400 的情况，给真人改错）：必填、长度上限（name≤50、body≤5000）、url 必须 http(s)。
2. **硬性拦截**（命中即判 spam）：
   - 蜜罐字段非空（CSS 隐藏的 `website` 输入框）；
   - 令牌缺失/签名错误/过期（>24h）/**提交过快**（<3s，机器人秒填）；
   - 未执行 JS 的直接表单 POST（无令牌即落入上条）；
   - **轻量工作量证明**：自托管的 ALTCHA 开源库（`altcha` 前端隐藏模式 + `altcha-lib` 在 Worker 内校验，无任何外部请求），提交时浏览器后台算 ~0.3s SHA‑256，真人无感，批量灌水成本显著上升；
   - 命中 `spam_rules` 中 weight≥100 的规则（关键词/域名/正则/IP/邮箱黑名单）。
3. **打分**（累加，≥阈值判 spam）：链接数 >2；含 `</a>`、`[url=`、`[link=`（旧站规则延续）；**正文无任何中日文字符且含链接**；url 字段为短链/常见垃圾 TLD；同一 ip_hash 1 分钟内 >3 条（D1 计数实现限流）；7 天内全站重复内容；昵称本身是网址等。阈值与权重集中在 `spam.ts` 常量。
4. 可选第二层：**Workers AI**（Cloudflare 自家，免费额度）只对“分数在灰区”的评论做一次分类，失败则忽略——作为后续增强，不在首期必做。

**静默过滤体验**：无论判定结果如何（格式错误除外），接口都返回 `200 {ok:true, comment}`，并把垃圾评论**照样写入 D1，status=spam**（便于你审查误判）。前端把自己提交的评论存入 `localStorage`（按 post_id），渲染时合并显示——提交者在自己浏览器里永远能看到自己的评论，而其他人看不到 spam。

**后台** `/admin/comments`（Cloudflare Access 保护 + Worker 校验 Access JWT）：按状态/文章筛选；操作：删除（硬删）、标记为垃圾、恢复为公开、**一键从该评论生成规则**（封域名/关键词/IP）。每日 cron（`wrangler.jsonc` `triggers.crons`，通过 Astro adapter 自定义 worker 入口导出 `scheduled`）清除 30 天前的 spam；若入口定制不便，则改为打开后台时顺带清理。
新评论通知（可选）：Cloudflare Email Routing 的 `send_email` binding 发到你已验证的邮箱，只通知 published 的评论。

## 四、在线编辑工作流（不用本地编译）

- `public/admin/index.html` 引入 Sveltia CMS，`config.yml`：`backend: github`（仓库 `kirikira/kirikira.moe`，分支 main），`collections.posts` 字段与 `content.config.ts` 一致（`id` 用 uuid 隐藏字段、`slug`、`date`、`category` 下拉、`tags` 列表、`draft` 开关、`music` 对象、`body` markdown），`media_folder: public/uploads`。
- 登录：个人自用直接用 GitHub fine‑grained PAT（只授该仓库 contents 读写）；如需 OAuth，再部署官方 `sveltia-cms-auth` Worker。
- 流程：打开 `https://kirikira.moe/admin/` → 编辑/上传图片 → 保存（即 commit）→ Workers Builds 云端 `astro build && wrangler deploy` → 1–2 分钟生效。手机上也可直接在 GitHub 网页改 `.md`。草稿用 `draft: true` 或在非 main 分支编辑拿预览 URL。

## 五、实施顺序

1. **准备**：`data/db.sqlite3` 就位并加入 `.gitignore`；确认 `kirikira.moe` 的 DNS 已托管在 Cloudflare（Workers 自定义域名需要）；创建 D1 库 `kirikira`。
2. **脚手架**：`git mv` 旧代码到 `legacy/`；`npm create astro@latest`（Astro 6）+ `@astrojs/cloudflare`、`@astrojs/rss`、`@astrojs/sitemap`；`wrangler.jsonc`；`npm run dev` 能在 workerd 中跑通。
3. **迁移脚本** → 生成 30+ 篇 `.md`、图片、`_redirects`、`comments.sql`；`verify.ts` 对账通过后提交（不含 `data/`）。
4. **主题复刻**：布局、列表、文章页、分类/标签/归档、RSS、sitemap、404、sw.js kill-switch。
5. **评论系统**：schema migration → `spam.ts`（先写 vitest 单测）→ API → 前端组件（含 localStorage 合并、ALTCHA 隐藏 PoW）→ 后台页 → cron。
6. **CMS**：Sveltia 配置与登录。
7. **上线**：Workers Builds 连接仓库 → 先部署到 `*.workers.dev` 全量验证 → Access 策略 → 导入评论到远程 D1 → 绑定自定义域名 `kirikira.moe`（切流量）→ 提交 sitemap → 旧服务器保留只读 1–2 周后下线。

## 验证

- `npm run build` 成功；`npx astro check` 无类型错误；`npx vitest run` 覆盖 `spam.ts`：蜜罐、过快、坏令牌、PoW 失败、多链接、无 CJK+链接、规则命中、正常中文评论放行。
- `verify.ts`：已发布文章数 = `blog_post where status='published'` 数；每篇评论数与旧库一致；所有图片本地文件存在；列出失效图片/音乐。
- 链接回归：从旧库生成全部旧 URL（`/`、`/page/N/`、`/post/<pk>/`、`/category/<pk>/`、`/rss/`、`/sitemap.xml`），对 `wrangler dev`（及上线后的 workers.dev）逐个 curl，期望 200 或 301→200。
- Playwright（用预装 Chromium）端到端：
  - 正常评论 → 另一个浏览器上下文可见；
  - 带 3 个链接的英文评论 → 提交者页面显示“成功”且可见，另一上下文不可见，D1 中 status=spam；
  - 无令牌 curl POST → 返回 200 但不公开；
  - 后台恢复/删除生效；
  - 先注册旧 `sw.js` 再访问新站，确认旧 SW 被注销、缓存清空。
- 上线后：Sveltia 改一处错字 → 确认 2 分钟内线上更新，且 Workers 用量仍在免费额度内。

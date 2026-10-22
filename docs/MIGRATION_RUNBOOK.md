# 迁移执行手册（给执行迁移的人/agent）

本手册假设新站代码已就绪（本仓库根目录的 Astro 项目），你手上有旧站生产库 `db.sqlite3`。
按顺序执行；每一步都有「预期结果」，不符合就停下来排查，不要跳步。

> **隐私红线**：`data/` 目录已被 `.gitignore` 忽略。`db.sqlite3`、`data/comments.sql`、
> `data/images.json`、`data/migration-report.md` 含评论者邮箱等个人数据，**绝不能提交或上传到任何地方**
> （除了 `wrangler d1 execute` 导入 D1）。提交前务必 `git status` 确认 `data/` 下没有文件被跟踪。

## 0. 环境

- Node **≥ 22.23.4**（推荐 24 LTS；`.node-version` 写的是 24）。迁移脚本用到 Node 内置的 `node:sqlite` 和 TypeScript 类型擦除，无需额外依赖。
- `npm ci`
- Cloudflare 账号，`npx wrangler login`（或设置 `CLOUDFLARE_API_TOKEN`）。
- 先跑一遍自检：`npm test && npx astro check && npm run build`，应全部通过（0 errors）。

## 1. 先用假数据演练（可选但推荐，2 分钟）

```sh
npm run migrate:fixture                       # 生成 data/fixture.sqlite3（与 Django 相同表结构）
npm run migrate:export -- --db data/fixture.sqlite3
npm run migrate:images
npm run migrate:verify -- --db data/fixture.sqlite3
```

预期：verify 输出 `OK: migrated content matches the database.`。
演练完**清理**：`rm src/content/posts/*.md; rm -rf public/uploads/legacy; git checkout public/_redirects; rm data/*`
（保留 `src/content/posts/.gitkeep`）。

## 2. 导出真实数据

```sh
mkdir -p data && cp /path/to/db.sqlite3 data/db.sqlite3
npm run migrate:export                        # 默认读取 data/db.sqlite3
```

生成：

| 输出 | 说明 | 提交？ |
|---|---|---|
| `src/content/posts/<id>.md` | 每篇文章一个文件，草稿带 `draft: true` | ✅ |
| `public/_redirects` 中的生成块 | 旧分类 URL `/category/<pk>/` → `/category/<名称>/` 的 301 | ✅ |
| `data/comments.sql` | 旧评论的 `INSERT OR IGNORE`（按 `legacy_id` 幂等） | ❌ |
| `data/migration-report.md` | 数量统计 + 需人工检查的清单 | ❌ |
| `data/legacy-urls.txt` | 旧站所有公开 URL，供第 6 步检查 | ❌ |

要点：
- **URL 不变**：文章文件名/slug 默认就是旧的数字 id，所以 `/post/12/` 原样可用，无需重定向。
  想给旧文换成英文 slug：写 `data/slugs.json`（如 `{"12": "v2ray-mitm"}`），带 `--slugs data/slugs.json --force` 重跑，会自动生成 `/post/12/ → /post/v2ray-mitm/` 的 301。
- **评论归属**：迁移文章的评论线程 id 固定为 `legacyId`（见 `src/lib/posts.ts` 的 `commentThreadId`），改 slug 不会丢评论。**不要改 `legacyId`。**
- 已存在的文件不会被覆盖，需要时加 `--force`。
- 正文转换（`scripts/migrate/lib.ts`，有单测）：去掉与标题重复的首个标题；pymdownx `???` 折叠块 → `<details>`；`` `#!lang code` `` → 普通行内代码；setext 标题转 ATX；标题整体平移使最浅一级为 `##`（旧站 downheader 的效果）；`~a b~` 转义（旧站不会把带空格的当下标）。`H~2~O` 这类下标保留，站点开启了 subscript，渲染与旧站一致。
- 摘要为空的文章会自动截取正文开头生成摘要（报告里标为 `auto-excerpt`，不想要就加 `--no-auto-excerpt`）。

**检查 `data/migration-report.md`**：
- `posts in DB` / `published` / `drafts` 数量合理；`orphan comments` 是引用了已删除文章的评论（被跳过）。
- 「Things to review by hand」逐条看：`raw-embed`（含 iframe/script，确认还能用）、`single-tilde`、`details-converted`、`inlinehilite-converted`。

## 3. 迁移图片

```sh
npm run migrate:images            # 加 --dry-run 先看会处理什么
```

- 外链图片（主要是 `i.yusa.me`，截至 2026-10 仍可访问）下载到 `public/uploads/legacy/<hash>.<ext>`，并改写文章里的链接；源站失效时自动尝试 Wayback Machine 原图。
- `/static/...` 从 `legacy/blog/static/` 复制；`/media/...` 需要旧服务器的 MEDIA_ROOT：`--media-dir /path/to/media`。
- 可重复执行（已下载的会跳过）。结果见 `data/images.json`。
- 失败的 URL 会保留原外链；如果不想下载某些站点的图（如 GitHub raw），用 `--skip-hosts raw.githubusercontent.com`。

## 4. 校验

```sh
npm run migrate:verify -- --check-remote
npm run build
```

预期：verify 退出码 0（`WARN` 可以接受但要看一眼：仍为外链的图片、失效的音乐 URL 等）；build 成功。
构建会用 zod 校验所有文章的 front matter，如果报错，按提示修文章。

抽查渲染：`npm run dev`，打开 http://localhost:4321 ，至少看：首页、一篇代码多的文章（如 V2Ray 系列）、一篇带音乐的文章、一篇有折叠块/脚注的文章、分类页、`/archives/`。和旧站（如果还在线）或 `legacy/articles-md/` 对照。

## 5. 提交内容

```sh
git status                         # 确认 data/ 下没有任何文件出现
git add src/content/posts public/uploads public/_redirects
git commit -m "content: migrate posts from Django database"
```

## 6. Cloudflare 部署

### 6.1 D1 数据库与密钥

```sh
npx wrangler d1 create kirikira
# 把输出的 database_id 填进 wrangler.jsonc 的 d1_databases[0].database_id（替换全 0 占位）
npm run db:migrate:remote          # 建表
npx wrangler d1 execute kirikira --remote --file data/comments.sql    # 导入旧评论（可重复执行）
npx wrangler d1 execute kirikira --remote --command "SELECT COUNT(*) FROM comments"
# ↑ 应等于报告里的 "comments exported to SQL"

openssl rand -hex 32 | npx wrangler secret put COMMENT_SECRET
```

### 6.2 部署

推荐用 **Workers Builds**（push 即自动部署，之后在 CMS 里改文章不需要本地任何操作）：
Cloudflare 控制台 → Workers & Pages → Create → Import a repository → 选本仓库，
Build command `npm run build`，Deploy command `npx wrangler deploy`，生产分支 `main`。
也可以手动：`npm run deploy`。

部署后先用 `https://kirikira-moe.<account>.workers.dev` 验证：

```sh
npm run check-urls -- https://kirikira-moe.<account>.workers.dev
```

预期：`N/N legacy URLs OK.`

### 6.3 管理后台保护（Cloudflare Access，必须做）

Zero Trust → Access → Applications → Add → Self-hosted：
- 域名：`kirikira.moe`，路径分别加 `admin/*` 和 `api/admin/*`（同一个应用里加两个目标）。
- Policy：Allow，Include → Emails → 站长邮箱。
- 创建后复制 **Application Audience (AUD) Tag**。
- 把 team 域名（如 `kiri.cloudflareaccess.com`）和 AUD 填进 `wrangler.jsonc` 的 `vars.ACCESS_TEAM_DOMAIN` / `vars.ACCESS_AUD`，提交并重新部署。

未配置这两个变量时，生产环境的 `/admin/comments` 一律 403（安全默认），本地 `npm run dev` 则直接放行。
注意 `*.workers.dev` 域名不在 Access 保护下，但 Worker 自己会校验 Access JWT，所以那里的后台同样是 403。

### 6.4 切换域名

1. 确认 `kirikira.moe` 的 DNS 已托管在 Cloudflare。
2. Worker → Settings → Domains & Routes → Add Custom Domain → `kirikira.moe`（如需要也加 `www`，并在 `_redirects` 里加 `www` → 根域的跳转，或用 Cloudflare 的 Redirect Rule）。
3. 原来指向旧服务器的 A/AAAA 记录会被替换；旧服务器先别关。
4. 切换后：`npm run check-urls -- https://kirikira.moe`。
5. 在 Google Search Console / Bing 提交 `https://kirikira.moe/sitemap-index.xml`。

### 6.5 旧 Service Worker

旧站在 `/sw.js` 注册过缓存首页的 Service Worker。新站的 `public/sw.js` 是「自毁」版本：老访客的浏览器下次检查更新时会清空缓存、注销自己并刷新页面；
页面里也会主动注销残留的 SW。**不要删除 `public/sw.js`**，至少保留一年。

## 7. CMS（在线写文章）

1. GitHub → Settings → Developer settings → Fine-grained token：仅本仓库，权限 Contents: Read and write。
2. 打开 `https://kirikira.moe/admin/`（受 Access 保护），选择用 token 登录。
3. 新建文章时填英文 slug（成为 `/post/<slug>/`）；保存即提交到 `main`，Workers Builds 约 1–2 分钟后上线。
4. 草稿：勾选「草稿」，线上不会显示，`npm run dev` 里能看到。

## 8. 收尾

- 新站稳定运行 1–2 周后再下线旧服务器。
- 旧库 `db.sqlite3` 和 `data/` 离线备份到安全的地方，然后从工作目录删除。
- 旧仓库中的 `legacy/kirikira/settings.py` 曾提交过 Django `SECRET_KEY`；旧站下线后它就无用了，但不要在任何地方复用它。

## 出问题时

| 现象 | 处理 |
|---|---|
| verify 报 `has no file` | export 时文件已存在被跳过 → 加 `--force` 重跑 |
| verify 报评论数量不一致 | 检查报告里的 orphan comments；重跑 export |
| build 报 front matter 错误 | 按提示修对应 `.md` |
| 评论区一直「加载中」 | 看 Worker 日志：多半是 D1 未建表（6.1）或 `COMMENT_SECRET` 未设置 |
| 正常评论被判为垃圾 | 后台筛选「垃圾」→ 勾选 → 恢复公开；看「状态」列里命中的规则，必要时调整 `src/lib/comments/spam.ts` 的权重，或在「过滤规则」里加负权重的白名单规则 |
| 想回滚 | DNS 指回旧服务器即可（旧站没有动过）；评论在 D1 里不会丢 |

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
npm run db:migrate:remote          # 建表（含 0002：AI 打分字段；以后新增 migration 也是这条命令）
npx wrangler d1 execute kirikira --remote --file data/comments.sql    # 导入旧评论（可重复执行）
npx wrangler d1 execute kirikira --remote --command "SELECT COUNT(*) FROM comments"
# ↑ 应等于报告里的 "comments exported to SQL"

openssl rand -hex 32 > /tmp/comment_secret && npx wrangler secret put COMMENT_SECRET < /tmp/comment_secret
# 把这个值存进密码管理器再删掉文件：重建 Worker 时要用同一个值（否则旧的 IP 哈希/封禁规则对不上）
```

### 6.2 部署（必须走 `scripts/deploy.mjs`，不要直接 `wrangler deploy`）

> 背景：预览站出现过「构建成功、上传成功，但所有路径（连 `/robots.txt` 都）返回 `error code: 1101`」，
> 只能删掉 Worker 重建。`astro build` 会让裸的 `wrangler deploy` 走 `no_bundle` 多模块上传（主模块 + 二十多个 chunk），
> 这条路反复出事。`scripts/deploy.mjs` 改为上传**单个打包好的脚本**，并且**新版本先不接流量**：
>
> 1. 预检：构建产物齐全、只有 1 个脚本、gzip 后远小于免费版 3 MiB 上限、D1 id 不是占位符
> 2. D1 迁移（迁移必须兼容正在运行的旧版本：只加列/加表，不删不改）
> 3. `wrangler versions upload`：上传新版本，拿到它专属的预览地址，**此时线上流量仍在旧版本**
> 4. `scripts/smoke.mjs` 冒烟测试这个预览地址（静态文件、首页、文章页、归档、RSS、评论 API + D1、PoW 签名、后台 404、404 页）——不通过就停，线上不受影响
> 5. 通过才 `wrangler versions deploy <新版本>@100%`，并更新 cron
> 6. 再对线上地址冒烟一次；失败则**自动回滚**到上一个版本并再验证
>
> 任何一步失败都以非 0 退出，Workers Builds 会把这次构建标红并发邮件。

**Workers Builds 设置**（Worker → Settings → Build）：

| 项 | 值 |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npm run deploy:only` |
| Non-production branch deploy command | `npx wrangler versions upload`（默认值即可，只出预览地址，不影响线上） |
| Production branch | `master` |
| Build cache | **关闭**（开着会复用旧的资源哈希，预览站曾因此大面积 404） |
| Build variables | `SITE_URL=https://kirikira.moe`（**域名绑好之后**再加；没加时用 workers.dev 地址做发布后验证） |

**第一次部署**（新 Worker 还没有可回滚的版本，只能显式确认）：

```sh
npm run build
node scripts/deploy.mjs --first          # 部署到 kirikira-moe.<子域>.workers.dev 并冒烟
npm run check-urls -- https://kirikira-moe.<子域>.workers.dev
```

预期：冒烟 `All 10 checks passed`，`N/N legacy URLs OK.`。之后的每次发布都不需要 `--first`；
如果脚本说「could not read the live version」，说明 API/登录出了问题，**不要**加 `--first` 硬推。

随时手动检查任一环境：`npm run smoke -- https://kirikira.moe`。

### 6.3 管理后台保护（Cloudflare Access，必须做）

Zero Trust → Access → Applications → Add → Self-hosted：
- 域名：`kirikira.moe`，路径加 `admine` 和 `admine/*`（同一个应用里加两个目标）。整个后台（CMS、评论管理、过滤规则、后台接口）都在 `/admine` 下。
- Policy：Allow，Include → Emails → 站长邮箱。
- 创建后复制 **Application Audience (AUD) Tag**。
- 把 team 域名（如 `kiri.cloudflareaccess.com`）和 AUD 填进 `wrangler.jsonc` 的 `vars.ACCESS_TEAM_DOMAIN` / `vars.ACCESS_AUD`，提交并重新部署。

未登录的访问者在 `/admine` 下看到的是普通 404 页（爬虫看不出有后台）。未配置这两个变量时，生产环境的后台对所有人都是 404（安全默认），本地 `npm run dev` 则直接放行。
注意 `*.workers.dev` 域名不在 Access 保护下，但 Worker 自己会校验 Access JWT，所以那里的后台同样是 404。

预览站（workers.dev，装不了 Access）：`openssl rand -hex 24 | npx wrangler secret put ADMIN_TOKEN`，然后打开一次 `/admine/?token=<这个值>`，之后靠 cookie 保持登录 30 天。**正式站不要设置 ADMIN_TOKEN。**

### 6.4 切换域名

1. 确认 `kirikira.moe` 的 DNS 已托管在 Cloudflare。
2. Worker → Settings → Domains & Routes → Add Custom Domain → `kirikira.moe`（如需要也加 `www`，并在 `_redirects` 里加 `www` → 根域的跳转，或用 Cloudflare 的 Redirect Rule）。
3. 原来指向旧服务器的 A/AAAA 记录会被替换；旧服务器先别关。
4. 切换后：`npm run smoke -- https://kirikira.moe` 和 `npm run check-urls -- https://kirikira.moe`。
5. 在 Workers Builds 里加 `SITE_URL=https://kirikira.moe`，以后每次发布都会验证正式域名。
6. 打开监控：GitHub 仓库 Settings → Secrets and variables → Actions → Variables 加 `WATCHDOG_URL=https://kirikira.moe`
   （可选再加 Secrets `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`）。`.github/workflows/watchdog.yml` 每 10 分钟检查一次，
   连续两次失败就开一个 `site-down` issue（GitHub 会发邮件/推送）并发 Telegram，恢复后自动关闭。
5. 在 Google Search Console / Bing 提交 `https://kirikira.moe/sitemap-index.xml`。

### 6.5 旧 Service Worker

旧站在 `/sw.js` 注册过缓存首页的 Service Worker。新站的 `public/sw.js` 是「自毁」版本：老访客的浏览器下次检查更新时会清空缓存、注销自己并刷新页面；
页面里也会主动注销残留的 SW。**不要删除 `public/sw.js`**，至少保留一年。

## 7. CMS（在线写文章）与媒体存储

### 7.1 登录 CMS

1. GitHub → Settings → Developer settings → Fine-grained token：仅本仓库，权限 Contents: Read and write。
2. 打开 `https://kirikira.moe/admine/`（受 Access 保护），选择用 token 登录。CMS 左下角的浮动条可以直接跳到「评论管理」「过滤规则」（同一次登录）。
3. 新建文章时填英文 slug（成为 `/post/<slug>/`，保存后锁定不可改）；保存即提交到 `main`，Workers Builds 约 1–2 分钟后上线。
4. 草稿：勾选「草稿」，线上不会显示，`npm run dev` 里能看到。

### 7.2 R2 媒体桶（图片/视频）

照片和所有视频/音频放 R2，不进 git（Workers 静态资源单文件上限 25 MiB，仓库也会越来越大）。R2 免费额度：10 GB 存储，出站流量免费。

1. Cloudflare → R2 → Create bucket：`kirikira-media`。
2. 桶 → Settings → Custom Domains → 添加 `media.kirikira.moe`（自动建 DNS 记录并公开读取）。
3. 桶 → Settings → CORS Policy：
   ```json
   [{ "AllowedOrigins": ["https://kirikira.moe"], "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 3000 }]
   ```
4. R2 → Manage API Tokens → Create：权限 **Object Read & Write**，只限 `kirikira-media` 桶。
5. 把 **Access Key ID** 和 **Account ID** 填进 `public/admine/config.yml` 的 `media_libraries.cloudflare_r2`（替换 `REPLACE_WITH_…`）并提交。
   **Secret Access Key 不要写进任何文件**：第一次在 CMS 里用 R2 上传时它会提示输入，只存在你的浏览器里。

（可选）迁移脚本默认把旧文章的图片放进 `public/uploads/legacy/`（进 git，约几十张，问题不大）。想统一放 R2：
`npx wrangler r2 object put kirikira-media/legacy/<文件名> --file public/uploads/legacy/<文件名> --remote` 逐个上传后，把文章里的 `/uploads/legacy/` 替换成 `https://media.kirikira.moe/legacy/`。

### 7.3 AI 反垃圾（Workers AI · Clef-flash）

`wrangler.jsonc` 里已绑定 `AI`，部署后自动生效，免费额度足够（每条评论约 1–2 Neuron，免费 10,000 Neuron/天）：

- 新评论：通过隐形计算验证、蜜罐、时间检查后，交给 Clef-flash 判断，结果和规则分数叠加（见 README「评论反垃圾」）。
- 旧评论：迁移脚本导入时已按规则判过一遍（报告里的「imported as spam」）。之后打开 `/admine/comments`，点「重新检查全部公开评论」，会用规则 + AI 分批重判全部公开评论，判为垃圾的移到「垃圾」列表，可以随时恢复；AI 不可用时自动只按规则判。改过规则后可以再跑。
- 验证提示词：`CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=…（Workers AI 权限） node scripts/eval/eval-spam.ts --compare`，对 `scripts/eval/spam-samples.json` 打分并对比旧的多题提示词；结果里「hides N genuine」必须是 0 才合并。被判错的真实评论（去掉邮箱）加进样本再跑。
- 关闭：把 `vars.AI_SPAM_CHECK` 改成 `"off"`。
- 本地开发（`npm run dev` / `wrangler dev --local`）没有 AI，只按规则判。

### 7.4 回复邮件通知（可选，默认关闭）

有人回复某条评论时，给那条评论的作者发邮件（他留了邮箱、没取消勾选「有人回复我时发邮件通知」、没退订）。没配置时整个功能关闭，评论框里也不显示那个勾选项；表结构（migration 0003）随部署自动建好，不影响任何现有功能。

为什么不用 Cloudflare 自己的发信：Cloudflare Email Service 给**任意地址**发信需要 Workers Paid（$5/月，含 3,000 封）；免费计划只能发给你自己账户里验证过的地址，通知不了读者。所以默认用 **Resend 免费计划**（3,000 封/月、100 封/天，个人博客的回复量远远够）。

1. 注册 https://resend.com ，Domains → Add Domain，建议用子域名 `notify.kirikira.moe`（不影响根域名的邮件信誉和 Email Routing 的 MX 记录）。它会给出几条 DNS 记录（DKIM、SPF、MX），选「Sign in to Cloudflare」自动添加，或手动加到 Cloudflare DNS（**关闭橙色云朵代理**）。等状态变成 Verified。
2. API Keys → Create，权限选 **Sending access**、只限这个域名。然后：
   ```sh
   npx wrangler secret put RESEND_API_KEY      # 粘贴 re_... ；只存在 Cloudflare，不进仓库
   ```
3. 在 `wrangler.jsonc` 的 `vars` 里填发件人并提交（Workers Builds 自动部署）：
   ```jsonc
   "MAIL_FROM": "Kiri 的博客 <noreply@notify.kirikira.moe>"
   ```
4. 验证：在任意文章下用自己的另一个邮箱留言，再回复它，1 分钟内应收到邮件；点邮件底部「不想再收到回复通知」应能退订。发送记录在 D1 的 `notifications` 表（只存邮箱的 HMAC，不存地址；失败的有错误信息）：
   ```sh
   npx wrangler d1 execute kirikira --remote --command "SELECT comment_id, status, error, created_at FROM notifications ORDER BY id DESC LIMIT 20"
   ```

规则：只通知已公开的回复（被判垃圾的不发；在后台把 7 天内的误判回复恢复为公开时会补发）；自己回复自己不发；同一个收件人每天最多 5 封，全站每天最多 `MAIL_DAILY_LIMIT`（默认 90，低于 Resend 免费的 100）；邮件里回复内容是纯文本，只链接到本站的评论；每封都带一键退订（`List-Unsubscribe`）。旧站导入的评论同样会收到通知（有邮箱的话），可随时退订。

**每条新评论都通知你（站长）**：再设一个 secret 就开启（和上面共用发信配置）：
```sh
npx wrangler secret put ADMIN_EMAIL      # 你的邮箱；用 secret 是为了不把地址写进公开仓库
```
每条评论（公开的，或被判为垃圾隐藏的）都会发一封：标题是「【新评论】」或「【已拦截】」+ 文章名 + 昵称，正文有状态、判定原因、AI 判断、作者昵称/邮箱/网址、评论原文、「查看评论」和「后台处理」链接；评论者留了邮箱的话，直接回复这封邮件就是回复给他。不发的情况：没通过隐形计算验证/蜜罐/时间检查的机器人（不是真浏览器，可能一天上百条，在后台看）、你自己的评论（邮箱和 `ADMIN_EMAIL` 相同）；每天最多 `ADMIN_EMAIL_DAILY_LIMIT`（默认 30）封，把 Resend 免费额度的大头留给读者的回复通知。关闭：`npx wrangler secret delete ADMIN_EMAIL`。

以后升级到 Workers Paid 想改用 Cloudflare 发信：在 Cloudflare 后台为域名开通 Email Service，`wrangler.jsonc` 加 `"send_email": [{ "name": "EMAIL" }]`，删掉 `RESEND_API_KEY` 这个 secret 即可（两者都有时优先用 Resend）。
关闭：把 `MAIL_FROM` 改回空字符串。

## 8. 收尾

- 新站稳定运行 1–2 周后再下线旧服务器。
- 旧库 `db.sqlite3` 和 `data/` 离线备份到安全的地方，然后从工作目录删除。
- 旧仓库中的 `legacy/kirikira/settings.py` 曾提交过 Django `SECRET_KEY`；旧站下线后它就无用了，但不要在任何地方复用它。

## 事故处理（线上打不开 / 1101 / 大面积 500）

按顺序做，每步之后 `npm run smoke -- https://kirikira.moe`：

1. **确认范围**：`curl -sI https://kirikira.moe/robots.txt`。静态文件也 1101/500，说明 Worker 在启动阶段就挂了（和预览站那次一样），不是业务代码的问题。
2. **回滚到上一个好版本**（几秒生效，D1 数据不受影响）：
   ```sh
   npx wrangler deployments list --name kirikira-moe                 # 找到上一个正常的版本 ID
   npx wrangler versions deploy <版本ID>@100 --yes --name kirikira-moe
   ```
3. **回滚也不行 = Worker 实体本身坏了**（预览站那次的情况）：用同一份构建换一个新 Worker 名，再把域名挪过去。数据都在 D1 里，不会丢。
   ```sh
   # wrangler.jsonc 里把 "name" 临时改成 "kirikira-moe-b"（不要提交），然后：
   npm run build && node scripts/deploy.mjs --first --no-migrate
   npx wrangler secret put COMMENT_SECRET --name kirikira-moe-b      # 用密码管理器里的同一个值
   npm run smoke -- https://kirikira-moe-b.<子域>.workers.dev
   ```
   冒烟通过后：控制台 → 旧 Worker → Domains & Routes 移除 `kirikira.moe` → 新 Worker 添加 `kirikira.moe`（约 1 分钟生效），
   Access 应用不用改（它按域名路径保护），然后把 Workers Builds 连到新 Worker 或把仓库里的 name 正式改过去。
4. 事后：在 `site-down` issue 里记录原因和处理，以后发布照常走 `scripts/deploy.mjs`。

**建议上线前在预览站演练一次第 2、3 步**，确认自己能在 10 分钟内恢复。

### 1102（Worker exceeded resource limits）

免费计划每个请求只有 **10 ms CPU**（等数据库、等 AI 的时间不算）。超过就是 1102，通常只影响动态请求（评论接口、后台），文章页是静态文件不受影响；而且往往是**操作已经完成、跳转后的那一页超了**，先刷新确认数据。

- 看是哪条路由、用了多少：`npx wrangler tail <worker名> --format json`，找 `"outcome": "exceededCpu"` 和 `cpuTime`；或控制台 → Worker → Observability → Logs，按 outcome 筛选。
- 代码里已经做的（2026-11）：Worker 里不再渲染 Markdown（评论由浏览器渲染，后台显示原文）；后台页面用不含侧栏/横幅图的轻量布局（`src/layouts/Admin.astro`）；评论列表每页 25 条；提交评论时的检查合并成一次 D1 查询。本地实测后台评论页、评论接口、提交评论都回到了约 10 ms 以内。
- 以后新增动态页面时同样注意：不要在 Worker 里 import 大库（Markdown、图片处理、全部文章），不要逐条查询数据库。
- 如果日志里仍然频繁 exceededCpu：升级 Workers Paid（$5/月，每请求 CPU 上限 30 秒，顺带可以用 Cloudflare 自己发通知邮件），代码不用改。

## 出问题时

| 现象 | 处理 |
|---|---|
| verify 报 `has no file` | export 时文件已存在被跳过 → 加 `--force` 重跑 |
| verify 报评论数量不一致 | 检查报告里的 orphan comments；重跑 export |
| build 报 front matter 错误 | 按提示修对应 `.md` |
| 评论区一直「加载中」 | 看 Worker 日志：多半是 D1 未建表（6.1）或 `COMMENT_SECRET` 未设置 |
| 正常评论被判为垃圾 | 后台筛选「垃圾」→ 勾选 → 恢复公开；看「状态」列里命中的规则，必要时调整 `src/lib/comments/spam.ts` 的权重，或在「过滤规则」里加负权重的白名单规则 |
| 想回滚 | DNS 指回旧服务器即可（旧站没有动过）；评论在 D1 里不会丢 |

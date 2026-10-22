# Kirikira.moe

Kiri 的博客。2026 年从 Django（`legacy/`）重构为 **Astro 7 + Cloudflare Workers**：

- **文章**：`src/content/posts/*.md`（Markdown + front matter），构建时预渲染为静态页。
- **在线编辑**：`/admin/` 上的 [Sveltia CMS](https://sveltiacms.app/)，保存即提交到 GitHub，Cloudflare Workers Builds 自动构建部署（1–2 分钟），本地不用编译。
- **评论**：自托管在 Cloudflare D1，免注册，不用任何第三方验证码。垃圾评论被**静默过滤**：发送者看到「评论成功」且在自己浏览器里能看到，其他人看不到；站长在 `/admin/comments` 审查、恢复或删除。
- 旧链接（`/post/<id>/`、`/page/<n>/`、`/category/<id>/`、`/rss/`、`/sitemap.xml`）全部保留或 301。

迁移步骤见 **[docs/MIGRATION_RUNBOOK.md](docs/MIGRATION_RUNBOOK.md)**，设计与选型见 [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)。

## 开发

需要 Node ≥ 22.23.4（推荐 24）。

```sh
npm ci
cp .dev.vars.example .dev.vars          # 本地密钥
npm run db:migrate:local                # 本地 D1 建表
npm run dev                             # http://localhost:4321 （本地后台免登录）
npm test                                # 单元测试（反垃圾规则、PoW、渲染、迁移转换）
npx astro check                         # 类型检查
npm run preview                         # 构建后用 wrangler 以生产模式运行（http://localhost:8787）
```

## 目录

```
src/
  content/posts/          文章（文件名 = URL slug）
  content.config.ts       front matter schema
  pages/                  页面；api/ 与 admin/ 是唯一的动态路由
  lib/comments/           评论系统：spam.ts（过滤规则）、pow.ts（工作量证明）、store.ts（D1）、service.ts
  lib/access.ts           Cloudflare Access JWT 校验（后台鉴权）
  scripts/comments.ts     评论区前端
  worker.ts               Worker 入口（Astro + 每日清理垃圾评论的 cron）
migrations/               D1 表结构
public/admin/             Sveltia CMS
scripts/migrate/          从 Django 数据库迁移的脚本
legacy/                   旧 Django 站点（只读参考）
```

## 评论反垃圾

全部在自己的 Worker 里完成（`src/lib/comments/spam.ts`）：

1. **隐形工作量证明**：浏览器在用户开始填写时后台计算约 0.5 秒（ALTCHA 开源算法，`altcha-lib`，无外部请求）。挑战由服务端 HMAC 签名，绑定文章与签发时间，一次性使用。
2. **时间陷阱**：拿到挑战后 2.5 秒内提交的判为机器人。
3. **蜜罐字段**：人看不见、机器人会填的隐藏输入框。
4. **打分规则**：链接数量、无中文且带链接、昵称是网址、HTML/BBCode 链接、短链/垃圾域名后缀、同 IP 频率、7 天内重复内容、内置关键词。
5. **自定义规则**：后台「过滤规则」页增删关键词/域名/正则/邮箱/IP（IP 只存 HMAC 哈希）。负权重可当白名单。

总分 ≥ 100 判为垃圾。评论里的链接一律 `nofollow ugc`，评论者网址不公开显示，对 SEO 灌水没有价值。
垃圾评论 30 天后自动删除（`SPAM_RETENTION_DAYS`）。

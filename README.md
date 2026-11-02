# Kirikira.moe

Kiri 的博客。2026 年从 Django（`legacy/`）重构为 **Astro 7 + Cloudflare Workers**：

- **文章**：`src/content/posts/*.md`（Markdown + front matter），构建时预渲染为静态页。
- **在线编辑**：`/admine/` 上的 [Sveltia CMS](https://sveltiacms.app/)，保存即提交到 GitHub，Cloudflare Workers Builds 自动构建部署（1–2 分钟），本地不用编译。
- **评论**：自托管在 Cloudflare D1，免注册，不用任何第三方验证码。垃圾评论被**静默过滤**：发送者看到「评论成功」且在自己浏览器里能看到，其他人看不到；站长在 `/admine/comments` 审查、恢复或删除（和 CMS 同一个后台、同一次登录；未登录访问 `/admine` 只会看到 404）。点评论旁的「↩ 回复」，输入框会出现在那条评论下面；回复会标出「回复 @某人」，点它跳到被回复的那条。被回复的人留了邮箱的话会收到邮件通知（可选功能，配置见 [runbook 7.4](docs/MIGRATION_RUNBOOK.md#74-回复邮件通知可选默认关闭)）。
- 旧链接（`/post/<id>/`、`/page/<n>/`、`/category/<id>/`、`/rss/`、`/sitemap.xml`）全部保留或 301。

迁移、发布与事故处理见 **[docs/MIGRATION_RUNBOOK.md](docs/MIGRATION_RUNBOOK.md)**，设计与选型见 [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)。

## 写文章：图片、视频、嵌入

全部是普通 Markdown，不需要手写 HTML（构建时处理：`src/lib/markdown/media.mjs`；浏览器端：`src/scripts/media.ts`）：

| 想要 | 在 CMS 里 | 对应的 Markdown | 显示效果 |
|---|---|---|---|
| 图片 | 直接**粘贴或拖进编辑器**（上传前自动转 WebP、限 2400px） | `![说明](url)` 单独一行 | 按方向自动排版：横图占 80%、竖图 50%、方图 60%（手机上 100% / 66% / 76%），不超过原图宽度、不超过 80% 屏高；**点击放大** |
| 带图注的图片 | 同上，加标题 | `![说明](url "图注")` | 图下显示图注，放大后也显示 |
| 多张图片 | 连续粘贴，**中间不空行** | 每行一张、相邻行 | **左右滑动的图集**：手机直接滑，电脑有左右箭头和圆点，显示「2 / 5」；点击进入可滑动、可双指/滚轮缩放的大图浏览 |
| 视频 | 工具栏「视频」按钮，上传到 R2 | `![说明](a.mp4)` | 按视频实际方向排版；也可放进图集 |
| 像 GIF 一样循环 | 「视频」按钮里勾选循环 | `![说明](a.mp4 "loop")` | 静音自动循环 |
| 音频 | — | `![说明](a.mp3)` | 播放条 |
| B站 / YouTube / 网易云 | 工具栏「嵌入」按钮 | 单独一行放链接 | 16:9 播放器 |
| 文字里的小图标 | — | `文字 ![](icon.png) 文字` | 高度 ≤64px 的图片保持在行内 |

- 图片尺寸在构建时读取（R2/外链图片只下载文件头），所以页面加载时不会跳动；读取失败的在浏览器里再判断方向。
- 上传位置：照片和所有视频/音频放 **Cloudflare R2**（`media.kirikira.moe`）；小图也可以放仓库（`public/uploads/`，限 5 MB）。
- 想在本地写也不用编译：Chrome/Edge 打开 `/admine/` 选「Work with Local Repository」。继续用 VS Code 的话，图床插件改成上传到 R2（S3 兼容接口），然后照上表写 Markdown。
- 旧文章里手写的 HTML（`<video>`、`<iframe>` 等）照样能用。

## 前端

布局按线上旧站逐项实测还原（横幅在内容栏内 150px、站名居中、文章卡片 751px + 侧栏 236px、Love Kiri 视频条 150px、绿色分页、深色页脚、日期「2026年2月27日 15:40 UTC」，全站时间统一用 UTC 并标明），实现换成了现代 Web 平台特性：

- **移动端**：侧栏在手机/平板上变成紧凑的标签云；手机上「READ MORE」变成「→」（同旧站）；输入框 16px 防止 iOS 聚焦时缩放；无横向滚动；长文有「回到顶部」按钮。
- **性能**：文章页是纯静态 HTML；横幅按屏幕宽度输出 AVIF/WebP（手机约 15 KB，原图 142 KB）；正文图片懒加载并预留尺寸（无布局跳动）；图片浏览器（PhotoSwipe）第一次点击时才下载；侧栏小视频只在可见时播放，开了「减少动态效果」或省流量模式就不播。
- **交互**：链接悬停即预取下一页；跨页面用 View Transitions 平滑切换；横幅视差改用 CSS 滚动驱动动画（不再监听滚动事件）；侧栏「功能」里有浅色/深色/跟随系统三档切换并记住选择；键盘可用（跳到正文链接、图集可用方向键）。

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
npm run deploy                          # 构建 + 安全发布：先上传不接流量的新版本 → 冒烟测试 → 切流量 → 再验证，失败自动回滚
npm run smoke -- https://kirikira.moe   # 随时检查线上是否真的可用（不是「构建成功」）
```

## 目录

```
src/
  content/posts/          文章（文件名 = URL slug）
  content.config.ts       front matter schema
  pages/                  页面；api/ 与 admin/ 是唯一的动态路由
  layouts/                Shell.astro（公共骨架）→ Base.astro（站点：横幅 + 侧栏）/ Admin.astro（后台：轻量，见 runbook「1102」）
  lib/comments/           评论系统：spam.ts（过滤规则）、ai.ts（Clef-flash）、pow.ts（工作量证明）、store.ts（D1）、service.ts、notify.ts + mail.ts（回复邮件通知）
  lib/access.ts           Cloudflare Access JWT 校验（后台鉴权）
  scripts/comments.ts     评论区前端
  worker.ts               Worker 入口（Astro + 每日清理垃圾评论的 cron）
migrations/               D1 表结构
public/admine/            Sveltia CMS（后台入口，Worker 统一鉴权）
scripts/migrate/          从 Django 数据库迁移的脚本
legacy/                   旧 Django 站点（只读参考）
```

## 评论反垃圾

全部在自己的 Worker 里完成（`src/lib/comments/spam.ts`、`src/lib/comments/ai.ts`）：

1. **隐形工作量证明**：浏览器在用户开始填写时后台计算约 0.5 秒（ALTCHA 开源算法，`altcha-lib`，无外部请求）。挑战由服务端 HMAC 签名，绑定文章与签发时间，一次性使用。
2. **时间陷阱**：拿到挑战后 2.5 秒内提交的判为机器人。
3. **蜜罐字段**：人看不见、机器人会填的隐藏输入框。
4. **结构规则**（只看结构，不看措辞；也是 AI 不可用时的兜底）：多个链接、正文罗列不带 http 的域名、无中文且带链接或网址、昵称是网址、HTML/BBCode 链接、短链、同 IP 频率、7 天内重复内容、少量明确的违规词（博彩、代开发票…）、**正文主要是读者不会用的文字**（西里尔、阿拉伯、韩文等；本站读者只写中文 > 英文 > 日文；颜文字里的「Д」「ω」不算）。不按域名后缀、不按「询价」之类的话术判断：个人站也会用 `.fun`/`.site`，真读者也会问价格。
5. **AI 判断（Workers AI · Clef-flash）**：Cloudflare 的决策模型，只问**一道单选题**：「这条评论是谁写的、为了什么？」选项是 真实读者 / 推广外链 / 群发模板套话 / 诈骗违规，各有具体描述，概率加起来是 1，模型必须表态（以前拆成五道是非题，每道都停在 50% 左右，叠加后只剩噪音）。给它的是站长审评论时会看的原始信息：文章标题和摘要、表单里填的昵称/邮箱/网址原样、评论原文、同一作者在本站的其他评论（换一种语言重复同一句话的机器人一眼可见），并明确告诉它本站读者只用中文、英文、日文，其他语言都是机器人。「真实读者」概率 ≤15% 直接判垃圾；≤40% 再加上任一条规则即判垃圾；≥85% 可以抵消结构规则的误伤，但推翻不了 1–3 和你自己加的规则；`=W=`、「好耶」、`233` 这类无链接短评论只有在 ≤5% 时才会被判。只有通过 1–3 的评论才会送去判断，机器人刷不掉免费额度（每条约 1–2 neurons，每天免费 10,000）。
   改提示词前后用 `node scripts/eval/eval-spam.ts --compare` 在真实 Workers AI 上量一下（需要 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`）：它对 `scripts/eval/spam-samples.json` 里标好的垃圾/正常评论打分，输出排序质量（AUC）和各阈值下拦住多少垃圾、误伤了谁。把后台里被判错的评论加进样本。
6. **自定义规则**：后台「过滤规则」页增删关键词/域名/正则/邮箱/IP（IP 只存 HMAC 哈希）。负权重可当白名单。

评论正文以 Markdown 原文存储和返回，由读者的浏览器渲染（markdown-it，禁用 HTML，链接加 `nofollow ugc`）：Worker 里不跑 Markdown 解析器，免费计划每请求 10 ms CPU 才够用。后台列表显示原文，看得到真实链接。

「链接」按不同网址计数（Markdown 写法 `[网址](网址)` 算一个）；只有表情、没有文字的评论（😘😘😘）就算填了网址也按无害短评论处理。

总分 ≥ 100 判为垃圾。评论里的链接一律 `nofollow ugc`，评论者网址不公开显示，对 SEO 灌水没有价值。
已有评论可以在后台一键「重新检查全部公开评论」（规则 + AI，AI 不可用时只按规则；改了规则后可以再跑）。迁移脚本导入旧评论时也会先按规则判一遍，明显的垃圾直接以隐藏状态导入；垃圾评论 30 天后自动删除（`SPAM_RETENTION_DAYS`）。

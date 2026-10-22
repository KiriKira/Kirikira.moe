#!/usr/bin/env node
/**
 * Build a small fake Django database with the real schema (see the legacy apps' migrations)
 * for testing the migration scripts without production data.
 *
 *   node scripts/migrate/make-fixture.ts [--out data/fixture.sqlite3]
 *
 * Covers: setext title headings, downheader levels, pymdownx details/inlinehilite/tilde,
 * footnotes, external + /static images, drafts, APlayer music, tags, orphan comments.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { out: { type: 'string', default: 'data/fixture.sqlite3' } } });
const out = resolve(import.meta.dirname, '../..', args.out!);
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });

const db = new DatabaseSync(out);
db.exec(`
CREATE TABLE "auth_user" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "password" varchar(128) NOT NULL, "last_login" datetime NULL, "is_superuser" bool NOT NULL, "username" varchar(150) NOT NULL UNIQUE, "first_name" varchar(30) NOT NULL, "email" varchar(254) NOT NULL, "is_staff" bool NOT NULL, "is_active" bool NOT NULL, "date_joined" datetime NOT NULL, "last_name" varchar(150) NOT NULL);
CREATE TABLE "blog_category" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "name" varchar(100) NOT NULL);
CREATE TABLE "blog_tag" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "name" varchar(100) NOT NULL);
CREATE TABLE "blog_post" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "title" varchar(70) NOT NULL, "body" text NOT NULL, "excerpt" varchar(200) NOT NULL, "author_id" integer NOT NULL REFERENCES "auth_user" ("id"), "category_id" integer NOT NULL REFERENCES "blog_category" ("id"), "status" varchar(10) NOT NULL, "created_time" datetime NOT NULL, "modified_time" datetime NOT NULL);
CREATE TABLE "blog_post_tags" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "post_id" integer NOT NULL REFERENCES "blog_post" ("id"), "tag_id" integer NOT NULL REFERENCES "blog_tag" ("id"));
CREATE TABLE "comments_comment" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "name" varchar(100) NOT NULL, "text" text NOT NULL, "created_time" datetime NOT NULL, "post_id" integer NOT NULL REFERENCES "blog_post" ("id"), "email" varchar(255) NOT NULL, "url" varchar(200) NOT NULL);
CREATE TABLE "aplayer_player" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "title" varchar(50) NOT NULL, "author" varchar(30) NOT NULL, "url" varchar(200) NOT NULL, "pic" varchar(200) NOT NULL, "post_id" integer NULL UNIQUE REFERENCES "blog_post" ("id"));
`);

db.prepare(
  `INSERT INTO auth_user VALUES (1, '!', NULL, 1, 'kiri', '', 'kiri@example.invalid', 1, 1, '2018-01-01 00:00:00', '')`,
).run();
for (const [id, name] of [
  [1, '技术'],
  [2, '随笔'],
  [3, '空分类'],
] as const) {
  db.prepare(`INSERT INTO blog_category (id, name) VALUES (?, ?)`).run(id, name);
}
for (const [id, name] of [
  [1, 'Linux'],
  [2, 'V2Ray'],
] as const) {
  db.prepare(`INSERT INTO blog_tag (id, name) VALUES (?, ?)`).run(id, name);
}

const posts: [number, string, string, string, number, string, string, string][] = [
  [
    1,
    '我曾出现在你的梦里吗',
    `我曾出现在你的梦里吗
==============

*本文使用 Rime 写作*

# 第一节

正文，含图片：

![banner](https://i.yusa.me/KyvvyloqBEOG.jpg)

## 小节

\`\`\`bash
# 这是注释，不是标题
echo hi
\`\`\`

H~2~O 与 ~~删除线~~。行内代码 \`#!python print(1)\`。

??? note "点我展开"
    隐藏的内容

    第二段

脚注[^1]

[^1]: 脚注内容
`,
    '',
    2,
    'published',
    '2018-02-08 12:55:00.123456',
    '2018-03-01 08:00:00',
  ],
  [
    2,
    'V2Ray 的进阶教程(2):MITM',
    `# 前言

<img src="/static/img/kiri.jpg" width="100">

### 深一点的标题

内容 [链接](https://v2ray.com) 和 https://github.com/v2ray
`,
    'MITM 教程',
    1,
    'published',
    '2018-05-20 10:00:00',
    '2018-05-20 10:00:00',
  ],
  [3, '还没写完的草稿', '草稿内容', '', 2, 'draft', '2019-01-01 00:00:00', '2019-01-01 00:00:00'],
];
for (const [id, title, body, excerpt, cat, status, created, modified] of posts) {
  db.prepare(
    `INSERT INTO blog_post (id, title, body, excerpt, author_id, category_id, status, created_time, modified_time) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
  ).run(id, title, body, excerpt, cat, status, created, modified);
}
db.prepare(`INSERT INTO blog_post_tags (post_id, tag_id) VALUES (2, 1), (2, 2)`).run();
db.prepare(
  `INSERT INTO aplayer_player (title, author, url, pic, post_id) VALUES ('Song', 'Singer', 'https://music.example/a.mp3', 'https://music.example/a.jpg', 1)`,
).run();

const comments: [number, string, string, string, string, string, number][] = [
  [1, '路人甲', 'a@example.com', '', '写得好！\n\n**加粗**', '2018-02-09 01:02:03.5', 1],
  [2, "O'Brien", '', 'https://obrien.example', "It's great; 'quotes' and \\ backslash", '2018-02-10 00:00:00', 1],
  [3, '路人乙', '', '', '第二篇的评论', '2018-06-01 12:00:00', 2],
  [4, '孤儿', '', '', '文章已删除', '2018-06-02 12:00:00', 99],
];
db.exec('PRAGMA foreign_keys = OFF');
for (const c of comments) {
  db.prepare(`INSERT INTO comments_comment (id, name, email, url, text, created_time, post_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(...c);
}
db.close();
console.log(`Fixture written to ${args.out}`);

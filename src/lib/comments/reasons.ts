/** Labels for the reason codes judgeComment() records (spam.ts), for the admin and emails. */
export const REASON_LABEL: [RegExp, string][] = [
  [/^honeypot/, '蜜罐字段被填写'],
  [/^pow:/, '没通过隐形计算验证'],
  [/^too-fast/, '提交过快'],
  [/^ip-(burst|flood)/, '同一 IP 短时间多次评论'],
  [/^html-or-bbcode-link/, 'HTML/BBCode 链接'],
  [/^links:/, '正文链接多'],
  [/^bare-domains:/, '正文罗列域名'],
  [/^no-cjk-with-link/, '无中文且带链接/网址'],
  [/^url-in-name/, '昵称是网址'],
  [/^foreign-script/, '非中英日文字'],
  [/^duplicate/, '重复内容'],
  [/^keyword:/, '内置关键词'],
  [/^shortener/, '短链接'],
  [/^rule:/, '自定义规则'],
  [/^ai:/, 'AI 判断'],
];
/** Human-readable reasons from a comment's spam_reasons JSON: 「标签（原始代码）」. */
export const reasons = (json: string | null): string[] => {
  try {
    const list = json ? (JSON.parse(json) as string[]) : [];
    return list.map((r) => {
      const label = REASON_LABEL.find(([re]) => re.test(r))?.[1];
      return label ? `${label}（${r}）` : r;
    });
  } catch {
    return [];
  }
};

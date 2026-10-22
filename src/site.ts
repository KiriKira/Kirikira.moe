export const SITE = {
  title: 'Kirikira.moe',
  tagline: '合缘奇缘，一期一会',
  author: 'Kiri',
  description: 'Python lover & Free Software believer. Not yet a developer.',
  ogTitle: '好耶, 是 Kiri',
  url: 'https://kirikira.moe',
  lang: 'zh-CN',
  feedTitle: '是Kiri的博客呢',
  feedDescription: '是Kiri的rss呢',
  postsPerPage: 10,
  since: 2018,
  /** Sidebar "Love Kiri!" card; the old site linked it to post 1. */
  loveKiriHref: '/post/1/',
};

export const SIDEBAR_LINKS: { label: string; href: string; html?: string }[] = [
  { label: 'RSS', href: '/rss.xml' },
  { label: '归档', href: '/archives/' },
  { label: '瑟琴导航', html: '<del>瑟琴</del>导航', href: 'https://sometimesoffline.online/' },
  { label: '坏镜像(by 孬瓜)', href: 'https://kirikira.com' },
];

export const FRIENDS: { name: string; href: string }[] = [
  { name: '空气拌饭 南琴浪', href: 'https://sometimesnaive.org/' },
  { name: 'YangMame', href: 'https://blog.yangmame.top/' },
  { name: '富婆 link', href: 'https://linkthis.ml/' },
  { name: '千千', href: 'https://wwyqianqian.github.io/' },
  { name: 'Equim', href: 'https://ekyu.moe/' },
  { name: '夏娜娜', href: 'https://void-shana.moe/' },
  { name: 'neo 喵', href: 'https://nfz.moe/' },
  { name: 'Makito', href: 'https://blog.keep.moe/' },
  { name: 'lxz', href: 'https://blog.ilxz.me/' },
  { name: '漩涡', href: 'https://xuanwo.io/' },
  { name: '艾老师', href: 'https://axionl.me/' },
  { name: 'fc 老师', href: 'https://farseerfc.me/' },
  { name: '惠', href: 'https://blog.megumifox.com/' },
  { name: '新一', href: 'https://a-wing.top/' },
  { name: '华科-蝴蝶PT', href: 'https://hudbt.hust.edu.cn/' },
  { name: '武大-珞樱PT', href: 'https://whu.pt/' },
];

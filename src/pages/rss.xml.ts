import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE } from '../site';
import { getPosts, postUrl } from '../lib/posts';

// Same shape as the Django feed: latest 20 posts, "[category] title", excerpt as description.
export const GET: APIRoute = async (context) => {
  const posts = (await getPosts()).slice(0, 20);
  return rss({
    title: SITE.feedTitle,
    description: SITE.feedDescription,
    site: context.site!,
    items: posts.map((post) => ({
      title: `[${post.data.category}] ${post.data.title}`,
      link: postUrl(post),
      pubDate: post.data.date,
      description: post.data.excerpt ?? '',
      categories: [post.data.category, ...post.data.tags],
    })),
    customData: `<language>zh-cn</language>`,
  });
};

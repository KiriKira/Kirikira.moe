import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const posts = defineCollection({
  // The file name (or `slug` front matter) becomes the URL: /post/<slug>/.
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    /** URL slug. Migrated posts keep their old numeric id so /post/<id>/ links still work. */
    slug: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    category: z.string().default('未分类'),
    tags: z.array(z.string()).default([]),
    excerpt: z.string().optional(),
    draft: z.boolean().default(false),
    /**
     * Comment thread id. Never change it once comments exist: it ties the post to
     * its rows in D1 even if the slug is renamed. Posts with `legacyId` use that
     * instead; posts with neither fall back to the slug. See commentThreadId().
     */
    cid: z.coerce.string().optional(),
    /** Django blog_post.id, for migrated posts. */
    legacyId: z.number().int().optional(),
    /** APlayer track (migrated from the old aplayer app). */
    music: z
      .object({
        title: z.string(),
        author: z.string().default(''),
        url: z.string(),
        pic: z.string().optional(),
      })
      .optional(),
  }),
});

export const collections = { posts };

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * The CMS (Sveltia) writes `null` for untouched optional fields and `''` for empty
 * strings, neither of which z.optional() accepts. Normalise both to "unset" so a post
 * saved through /admine/ can never fail the whole build.
 */
const unset = (v: unknown) => (v === '' || v === null ? undefined : v);
const optional = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(unset, schema.optional());

/** The site runs on UTC. A date written without an offset (`2026-11-01T19:48:00`, e.g. typed
 * by hand) is read as UTC rather than the build machine's zone; values that already carry
 * Z or ±hh:mm are left alone. */
const localDate = (v: unknown) => {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return undefined;
  const naive = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)?$/;
  return naive.test(s) ? `${s.replace(' ', 'T')}Z` : s;
};

const posts = defineCollection({
  // The file name becomes the URL: /post/<file-name>/.
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    /** Kept for migrated posts; routing uses the file name. */
    slug: optional(z.string()),
    date: z.preprocess(localDate, z.coerce.date()),
    updated: optional(z.preprocess(localDate, z.coerce.date())),
    category: z.string().default('未分类'),
    tags: z.preprocess((v) => (v === '' || v === null ? [] : v), z.array(z.string()).default([])),
    excerpt: optional(z.string()),
    draft: z.boolean().default(false),
    /**
     * Comment thread id. Never change it once comments exist: it ties the post to
     * its rows in D1 even if the slug is renamed. Posts with `legacyId` use that
     * instead; posts with neither fall back to the file name. See commentThreadId().
     */
    cid: optional(z.coerce.string()),
    /** Django blog_post.id, for migrated posts. */
    legacyId: optional(z.coerce.number().int()),
    /** APlayer track (migrated from the old aplayer app). */
    music: optional(
      z.object({
        title: z.string(),
        author: z.string().default(''),
        url: z.string(),
        pic: optional(z.string()),
      }),
    ),
  }),
});

export const collections = { posts };

// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import { externalLinks } from './src/lib/markdown/external-links.mjs';

export default defineConfig({
  site: 'https://kirikira.moe',
  // Pages are prerendered by default; only comment APIs and the comment admin
  // opt into on-demand rendering with `export const prerender = false`.
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  adapter: cloudflare({
    // Optimise images at build time; avoids needing the (metered) Images binding.
    imageService: 'compile',
  }),
  session: false,
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin/'),
    }),
  ],
  markdown: {
    processor: satteri({
      features: {
        gfm: { footnotes: { label: '脚注', backLabel: '返回引用 {reference}' } },
        // Chinese prose: SmartyPants-style quote/dash rewriting does more harm than good.
        smartPunctuation: false,
        // pymdownx.tilde on the old site: ~x~ is <sub>, ~~x~~ is <del>.
        subscript: true,
      },
      hastPlugins: [externalLinks],
    }),
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      wrap: true,
    },
  },
});

import { defineHastPlugin } from 'satteri';

/**
 * Open off-site links in a new tab (replaces python-markdown-newtab from the
 * Django site). Links back to kirikira.moe stay in the same tab.
 */
export const externalLinks = defineHastPlugin({
  name: 'kirikira-external-links',
  element: {
    filter: ['a'],
    visit(node, ctx) {
      const href = node.properties.href;
      if (typeof href !== 'string' || !/^https?:\/\//i.test(href)) return;
      if (/^https?:\/\/(www\.)?kirikira\.moe(\/|$)/i.test(href)) return;
      ctx.setProperty(node, 'target', '_blank');
      ctx.setProperty(node, 'rel', 'noopener noreferrer');
    },
  },
});

import MarkdownIt from 'markdown-it';

/**
 * Comment Markdown renderer. Raw HTML is disabled, so the output is safe to
 * inject; images are shown as plain links (no hotlinked tracking pixels), and
 * every link is marked nofollow/ugc so spam earns no SEO value.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
md.disable(['image', 'heading', 'lheading', 'table']);

const defaultLinkOpen =
  md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  token.attrSet('rel', 'nofollow ugc noopener noreferrer');
  token.attrSet('target', '_blank');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderCommentBody(body: string): string {
  return md.render(body);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

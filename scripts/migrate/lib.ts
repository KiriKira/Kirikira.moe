/**
 * Pure helpers for migrating the Django blog (legacy/) to Astro content files.
 * No I/O here so they can be unit tested (tests/migrate.test.ts).
 *
 * Old rendering pipeline (legacy/blog/views.py):
 *   markdown(body, ['pymdownx.superfences', 'pymdownx.betterem', NewTabExtension(),
 *     'downheader(levels=2)', 'pymdownx.tilde', 'pymdownx.inlinehilite',
 *     'pymdownx.details', 'markdown.extensions.footnotes'])
 */

export interface Warning {
  kind: string;
  detail: string;
}

/**
 * Parse a Django DateTimeField value as stored by the sqlite backend with
 * USE_TZ=True and TIME_ZONE='UTC' ("2018-02-08 12:55:00.123456", naive UTC).
 */
export function parseDjangoDate(value: string): Date {
  const v = String(value).trim();
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!m) throw new Error(`Unrecognised datetime: ${v}`);
  const frac = m[3] ? m[3].slice(0, 4) : '';
  const tz = m[4] ? (m[4] === 'Z' ? 'Z' : m[4].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')) : 'Z';
  const d = new Date(`${m[1]}T${m[2]}${frac}${tz}`);
  if (Number.isNaN(d.valueOf())) throw new Error(`Invalid datetime: ${v}`);
  return d;
}

/** Quote a string as a YAML double-quoted scalar (JSON strings are valid YAML). */
export const yamlString = (s: string) => JSON.stringify(s);

export interface FrontMatter {
  title: string;
  slug: string;
  date: Date;
  updated?: Date;
  category: string;
  tags: string[];
  excerpt?: string;
  draft: boolean;
  legacyId: number;
  music?: { title: string; author: string; url: string; pic?: string };
}

export function renderFrontMatter(fm: FrontMatter): string {
  const lines = [
    '---',
    `title: ${yamlString(fm.title)}`,
    `slug: ${yamlString(fm.slug)}`,
    `date: ${fm.date.toISOString()}`,
  ];
  if (fm.updated) lines.push(`updated: ${fm.updated.toISOString()}`);
  lines.push(`category: ${yamlString(fm.category)}`);
  lines.push(`tags: [${fm.tags.map(yamlString).join(', ')}]`);
  if (fm.excerpt) lines.push(`excerpt: ${yamlString(fm.excerpt)}`);
  lines.push(`draft: ${fm.draft}`);
  lines.push(`legacyId: ${fm.legacyId}`);
  lines.push(`cid: ${yamlString(String(fm.legacyId))}`);
  if (fm.music) {
    lines.push('music:');
    lines.push(`  title: ${yamlString(fm.music.title)}`);
    lines.push(`  author: ${yamlString(fm.music.author)}`);
    lines.push(`  url: ${yamlString(fm.music.url)}`);
    if (fm.music.pic) lines.push(`  pic: ${yamlString(fm.music.pic)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/** Calls fn for every line outside fenced code blocks; fn returns the replacement line(s). */
function mapOutsideFences(lines: string[], fn: (line: string, i: number, out: string[]) => string | string[] | null): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(FENCE_RE);
    if (fence) {
      out.push(line);
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      out.push(line);
      continue;
    }
    const r = fn(line, i, out);
    if (r === null) continue;
    if (Array.isArray(r)) out.push(...r);
    else out.push(r);
  }
  return out;
}

/** Remove a leading heading that just repeats the post title (the exported .md files had one). */
export function stripTitleHeading(body: string, title: string): string {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return body;
  const atx = lines[i].match(/^#{1,2}\s+(.*?)\s*#*\s*$/);
  if (atx && norm(atx[1]) === norm(title)) return lines.slice(i + 1).join('\n').replace(/^\n+/, '');
  if (i + 1 < lines.length && /^(=+|-+)\s*$/.test(lines[i + 1]) && norm(lines[i]) === norm(title)) {
    return lines.slice(i + 2).join('\n').replace(/^\n+/, '');
  }
  return body;
}

/** Turn setext headings (Title\n=====) into ATX so heading levels can be shifted uniformly. */
export function setextToAtx(body: string): string {
  const lines = body.split('\n');
  const result = mapOutsideFences(lines, (line, _i, out) => {
    const prev = out.length ? out[out.length - 1] : '';
    const isUnderline = /^ {0,3}(=+|-+)\s*$/.test(line);
    const prevIsText =
      prev.trim() !== '' &&
      !/^ {0,3}([-*+]|\d+[.)])\s/.test(prev) && // list item
      !/^ {0,3}(>|#|\||<)/.test(prev) && // quote, heading, table, html
      !/^ {4}/.test(prev); // indented code
    // Only single-line paragraphs; anything fancier is left for a human (and reported by verify).
    const paragraphStart = out.length < 2 || out[out.length - 2].trim() === '';
    if (isUnderline && prevIsText && paragraphStart) {
      const level = line.trim()[0] === '=' ? 1 : 2;
      out[out.length - 1] = `${'#'.repeat(level)} ${prev.trim()}`;
      return null;
    }
    return line;
  });
  return result.join('\n');
}

/**
 * The old site rendered body headings two levels down (downheader levels=2) under
 * an <h1> title. Shift so the shallowest heading becomes <h2>.
 */
export function normalizeHeadings(body: string): string {
  const lines = body.split('\n');
  let min = 7;
  mapOutsideFences(lines, (line) => {
    const m = line.match(/^(#{1,6})\s/);
    if (m) min = Math.min(min, m[1].length);
    return line;
  });
  if (min === 7 || min === 2) return body;
  const shift = 2 - min;
  return mapOutsideFences(lines, (line) => {
    const m = line.match(/^(#{1,6})(\s.*)$/);
    if (!m) return line;
    return `${'#'.repeat(Math.min(6, Math.max(1, m[1].length + shift)))}${m[2]}`;
  }).join('\n');
}

/**
 * pymdownx.details:  `??? type "Title"` / `???+ type "Title"` followed by an
 * indented block  ->  <details><summary>Title</summary> ... </details>
 */
export function convertDetails(body: string, warnings: Warning[]): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(FENCE_RE);
    if (fence) {
      out.push(line);
      if (f && f[1][0] === fence[0] && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      out.push(line);
      continue;
    }
    const m = line.match(/^(\s*)\?\?\?(\+?)\s+([\w-]+)?(?:\s+"(.*)")?\s*$/);
    if (!m) {
      out.push(line);
      continue;
    }
    const indent = m[1];
    const open = m[2] === '+';
    const summary = m[4] ?? (m[3] ? m[3][0].toUpperCase() + m[3].slice(1) : 'Details');
    const block: string[] = [];
    let j = i + 1;
    const inner = `${indent}    `;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() === '') {
        block.push('');
        continue;
      }
      if (l.startsWith(inner) || l.startsWith(`${indent}\t`)) {
        block.push(l.startsWith(inner) ? indent + l.slice(inner.length) : indent + l.slice(indent.length + 1));
        continue;
      }
      break;
    }
    while (block.length && block[block.length - 1] === '') block.pop();
    out.push(`${indent}<details${open ? ' open' : ''}><summary>${escapeHtml(summary)}</summary>`, '', ...block, '', `${indent}</details>`, '');
    warnings.push({ kind: 'details-converted', detail: summary });
    i = j - 1;
  }
  return out.join('\n');
}

/** pymdownx.inlinehilite: `#!python code` or `:::python code` -> `code` */
export function convertInlineHilite(body: string, warnings: Warning[]): string {
  return mapOutsideFences(body.split('\n'), (line) =>
    line.replace(/`(?:#!|:::)([\w+#.-]+) ([^`]+)`/g, (_all, lang: string, code: string) => {
      warnings.push({ kind: 'inlinehilite-converted', detail: `${lang}: ${code.slice(0, 40)}` });
      return `\`${code}\``;
    }),
  ).join('\n');
}

const SINGLE_TILDE_RE = /(^|[^~\\])~([^~\s][^~]*?)~(?!~)/g;

/** Apply fn to the parts of a line that are not inline code spans. */
function mapOutsideInlineCode(line: string, fn: (text: string) => string): string {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join('');
}

const isIndentedCode = (line: string) => /^( {4}|\t)/.test(line);

/**
 * pymdownx.tilde: ~x~ is <sub> (we enable Sätteri's subscript to match), but only
 * when x has no whitespace. Sätteri also accepts "~a b~", so escape those to keep
 * them literal like the old site did.
 */
export function escapeSpacedSubscripts(body: string): string {
  return mapOutsideFences(body.split('\n'), (line) =>
    isIndentedCode(line)
      ? line
      : mapOutsideInlineCode(line, (text) =>
          text.replace(SINGLE_TILDE_RE, (all, pre: string, inner: string) => (/\s/.test(inner) ? `${pre}\\~${inner}\\~` : all)),
        ),
  ).join('\n');
}

/** Single-tilde subscripts left in the body, for the review list. */
export function findSingleTildes(body: string): string[] {
  const hits: string[] = [];
  mapOutsideFences(body.split('\n'), (line) => {
    if (!isIndentedCode(line)) {
      mapOutsideInlineCode(line, (text) => {
        for (const m of text.matchAll(SINGLE_TILDE_RE)) hits.push(m[2]);
        return text;
      });
    }
    return line;
  });
  return hits;
}

const IMAGE_MD_RE = /!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
const IMAGE_HTML_RE = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
const IMAGE_REF_RE = /^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+["'(].*)?$/gm;

/** All image URLs referenced by a Markdown body (inline, HTML <img> and reference definitions). */
export function findImageUrls(body: string): string[] {
  const urls = new Set<string>();
  for (const m of body.matchAll(IMAGE_MD_RE)) urls.add(m[1]);
  for (const m of body.matchAll(IMAGE_HTML_RE)) urls.add(m[1]);
  // Reference-style definitions are only images if used as ![..][ref]; include likely image URLs.
  for (const m of body.matchAll(IMAGE_REF_RE)) if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(m[1])) urls.add(m[1]);
  return [...urls];
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Plain-text excerpt from Markdown, used when the Django excerpt field was empty. */
export function autoExcerpt(body: string, max = 120): string {
  // Paragraph blocks only: skip code, headings, HTML, tables, footnote definitions.
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (current.length) blocks.push(current.join(' '));
    current = [];
  };
  for (const line of body.split('\n')) {
    const f = line.match(FENCE_RE);
    if (fence) {
      if (f && f[1][0] === fence[0] && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) {
      flush();
      fence = f[1];
      continue;
    }
    if (line.trim() === '') flush();
    else current.push(line);
  }
  flush();

  const parts: string[] = [];
  let length = 0;
  for (const block of blocks) {
    if (/^\s{0,3}(#{1,6}\s|<|\||\[\^[^\]]+\]:|( {4}|\t))/.test(block)) continue;
    const text = block
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[\^[^\]]+\]/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/^\s{0,3}(>|[-*+]|\d+\.)\s+/gm, '')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    parts.push(text);
    length += [...text].length;
    if (length >= max) break;
  }
  const text = parts.join(' ');
  return [...text].length > max ? `${[...text].slice(0, max).join('')}…` : text;
}

/** Full body transform; returns the new body plus anything a human should look at. */
export function transformBody(rawBody: string, title: string): { body: string; warnings: Warning[] } {
  const warnings: Warning[] = [];
  let body = rawBody.replace(/\r\n?/g, '\n');
  body = stripTitleHeading(body, title);
  body = convertDetails(body, warnings);
  body = convertInlineHilite(body, warnings);
  body = setextToAtx(body);
  body = normalizeHeadings(body);
  body = escapeSpacedSubscripts(body);
  for (const t of findSingleTildes(body)) warnings.push({ kind: 'single-tilde', detail: `~${t}~` });
  if (/<(script|iframe|embed|object)\b/i.test(body)) warnings.push({ kind: 'raw-embed', detail: 'contains <script>/<iframe>/<embed>' });
  body = `${body.replace(/\s+$/, '')}\n`;
  return { body, warnings };
}

/** SQL string literal for SQLite/D1. */
export function sql(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

/** Category/tag name -> URL path segment (matches src/lib/posts.ts categoryUrl). */
export const pathSegment = (name: string) => encodeURIComponent(name);

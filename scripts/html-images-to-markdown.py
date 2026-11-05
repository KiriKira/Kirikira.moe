#!/usr/bin/env python3
"""Rewrite legacy HTML media in posts as plain Markdown (see src/lib/markdown/media.mjs).

Old posts hand-wrote HTML because the previous site needed explicit sizes:

    <div style="text-align: center;"><img src="…" alt="image" width="50%" height="auto"></div>
    ___<center>降 临</center>___
    <video style="width:100%" controls><source src="….mp4"></video>

The new pipeline does all of that from plain Markdown: figures are sized by the image's own
orientation (landscape 80% / portrait 50% / square 60%), two or more images on consecutive
lines become a swipeable gallery, `![alt](url "图注")` renders a caption, and `![](x.mp4)`
becomes a video player. So the HTML is dead weight.

Passes (idempotent, safe to re-run):
  1. image wrapper / bare <img>      -> ![alt](src), one per line
  2. caption right after an image     -> the image's Markdown title ("图注")
  3. <video><source src></video>      -> ![](src)
  4. blank lines around media runs    -> images sit alone in their paragraph, so they render
                                         as a figure/gallery instead of inline `img-block`

Adjacency is preserved: images already on neighbouring lines stay neighbours (one gallery),
images separated by text or a blank line stay separate figures.

Usage: python3 scripts/html-images-to-markdown.py [--check] [paths…]
"""
import glob
import re
import sys

IMG = re.compile(r'<img\b[^>]*>', re.IGNORECASE)
SRC = re.compile(r'\bsrc\s*=\s*"([^"]+)"', re.IGNORECASE)
ALT = re.compile(r'\balt\s*=\s*"([^"]*)"', re.IGNORECASE)
WRAPPER_ONLY = re.compile(r'^(?:\s*<div\b[^>]*>|\s*</div>|\s*<p\b[^>]*>|\s*</p>|\s*<center>|\s*</center>)+$', re.IGNORECASE)
USELESS_ALT = {'', 'image', 'img', '图片', 'screenshot'}

# ![alt](url) or ![alt](url "caption") — a media line we produced.
MD_MEDIA = re.compile(r'^!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)$')
MD_IMAGE = re.compile(r'^!\[(?P<alt>[^\]]*)\]\((?P<url>[^)\s]+)\)$')
MD_MEDIA_TITLED = re.compile(r'^!\[[^\]]*\]\([^)\s]+\s+"')

VIDEO_BLOCK = re.compile(
    r'^\s*<video\b[^>]*>\s*<source\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>\s*</video>\s*$', re.IGNORECASE
)
CAPTION = re.compile(r'^\s*(?:_+|\*+)?\s*<center>\s*(.+?)\s*</center>\s*(?:_+|\*+)?\s*$', re.IGNORECASE)

LISTISH = re.compile(r'^\s*(?:[-*+]\s|\d+[.)]\s|>|\||#|```|    |\t)')


def clean_alt(raw: str | None) -> str:
    text = (raw or '').strip()
    if text.lower() in USELESS_ALT:
        return ''
    text = text.replace('[', '(').replace(']', ')').replace('\\', '/')
    return re.sub(r'\s+', ' ', text)


def clean_caption(raw: str) -> str:
    text = re.sub(r'\s+', ' ', raw.strip())
    return text.replace('"', "'").replace('[', '(').replace(']', ')')


def pass_images(lines: list[str]) -> tuple[list[str], int, int]:
    out, replaced, images = [], 0, 0
    for line in lines:
        if '<img' not in line.lower():
            out.append(line)
            continue
        tags = IMG.findall(line)
        rest = IMG.sub('', line).strip()
        if rest and not WRAPPER_ONLY.match(rest):
            out.append(line)
            continue
        md, ok = [], True
        for tag in tags:
            src = SRC.search(tag)
            if not src:
                ok = False
                break
            alt = ALT.search(tag)
            md.append('![%s](%s)' % (clean_alt(alt.group(1) if alt else ''), src.group(1)))
        if not ok:
            out.append(line)
            continue
        replaced += 1
        images += len(md)
        out.extend(md)
    return out, replaced, images


def pass_captions(lines: list[str]) -> tuple[list[str], int]:
    """`___<center>说明</center>___` right after an image becomes that image's title."""
    out = list(lines)
    attached = 0
    i = 0
    while i < len(out):
        m = CAPTION.match(out[i])
        if not m:
            i += 1
            continue
        # look back over blank lines for the image this caption belongs to
        j = i - 1
        while j >= 0 and not out[j].strip():
            j -= 1
        caption = clean_caption(strip_tags(m.group(1)))
        if j >= 0 and MD_MEDIA.match(out[j].strip()) and not MD_MEDIA_TITLED.match(out[j].strip()):
            md = MD_IMAGE.match(out[j].strip())
            if md:
                out[j] = '![%s](%s "%s")' % (md.group('alt'), md.group('url'), caption)
                # drop the caption line and the blank run that separated them
                del out[i]
                while j + 1 < len(out) and not out[j + 1].strip():
                    del out[j + 1]
                attached += 1
                i = j + 1
                continue
            # a media line that is not a plain image (gallery line with title, video): keep as note
        # No image above to caption: keep the emphasis, drop the HTML.
        out[i] = '*%s*' % caption
        i += 1
    return out, attached


def strip_tags(text: str) -> str:
    return re.sub(r'<[^>]+>', '', text)


def pass_split_images(lines: list[str]) -> tuple[list[str], int]:
    """A handful of posts wrap an image URL across two lines; Markdown needs it on one."""
    out, joined = [], 0
    i = 0
    while i < len(lines):
        line = lines[i]
        # An image whose URL was wrapped onto the next line: the line stops before the final ")".
        # Counting parentheses is not enough — captions contain "（…）" and stray "(".
        if line.lstrip().startswith('![') and not line.rstrip().endswith(')'):
            merged = line
            j = i + 1
            while j < len(lines) and not merged.rstrip().endswith(')'):
                merged = merged.rstrip() + lines[j].strip()
                j += 1
            out.append(merged)
            joined += 1
            i = j
            continue
        out.append(line)
        i += 1
    return out, joined


def pass_titles(lines: list[str]) -> tuple[list[str], int]:
    """Titles inherited from the old site sometimes still carry <strong>/<em>."""
    out, n = [], 0
    for line in lines:
        m = re.match(r'^(!\[[^\]]*\]\([^)\s]+)\s+"(.*)"\)$', line)
        if m and '<' in m.group(2):
            out.append('%s "%s")' % (m.group(1), clean_caption(strip_tags(m.group(2)))))
            n += 1
        else:
            out.append(line)
    return out, n


def pass_split_joined(lines: list[str]) -> tuple[list[str], int]:
    """`![a](x)![[b](y)` on one line renders inline; one image per line instead."""
    out, n = [], 0
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('![') and ')!![' not in stripped and stripped.count('![') > 1:
            parts = re.split(r'(?<=\))(?=!\[)', stripped)
            out.extend(parts)
            n += len(parts) - 1
        else:
            out.append(line)
    return out, n


def pass_strip_comments(lines: list[str]) -> tuple[list[str], int]:
    """Migration bookkeeping (`<!-- uuid -->`) glued to an image made it render inline."""
    out, n = [], 0
    for line in lines:
        if '<!--' in line:
            cleaned = re.sub(r'\s*<!--.*?-->', '', line).rstrip()
            if cleaned != line:
                n += 1
            out.append(cleaned)
        else:
            out.append(line)
    return out, n


def pass_orphan_divs(lines: list[str]) -> tuple[list[str], int]:
    """A centred <div> left behind around Markdown images serves no purpose."""
    out, n = [], 0
    for line in lines:
        if re.fullmatch(r'\s*<div\b[^>]*text-align:\s*center[^>]*>\s*', line) or line.strip() == '</div>':
            n += 1
            continue
        out.append(line)
    return out, n


def pass_unstick_media(lines: list[str]) -> tuple[list[str], int]:
    """`![a](x)正文` on one line renders the image inline; put it in its own paragraph."""
    media = r'!\[[^\]]*\]\([^)\s]+(?:\s+"[^"]*")?\)'
    out, n = [], 0
    for line in lines:
        if line.startswith(' ') or not line.strip():
            out.append(line)
            continue
        m = re.match(r'^(' + media + r')\s*(\S.*)$', line.strip())
        if m:
            out.extend([m.group(1), '', m.group(2)])
            n += 1
            continue
        m = re.match(r'^(.+?)\s*(' + media + r')$', line.strip())
        if m and not m.group(1).startswith('!'):
            out.extend([m.group(1), '', m.group(2)])
            n += 1
            continue
        out.append(line)
    return out, n


def pass_join_groups(lines: list[str]) -> tuple[list[str], int]:
    """Images separated only by blank lines are still consecutive: blank lines must not split
    a gallery. Only real text (or a heading) breaks the run."""
    out = []
    merged = 0
    i = 0
    while i < len(lines):
        out.append(lines[i])
        if MD_MEDIA.match(lines[i].strip()) and not lines[i].startswith(' '):
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and MD_MEDIA.match(lines[j].strip()) and not lines[j].startswith(' '):
                merged += j - i - 1
                i = j
                continue
        i += 1
    return out, merged


def pass_videos(lines: list[str]) -> tuple[list[str], int]:
    out, n = [], 0
    for line in lines:
        m = VIDEO_BLOCK.match(line)
        if m:
            out.append('![](%s)' % m.group(1))
            n += 1
        else:
            out.append(line)
    return out, n


def pass_spacing(lines: list[str]) -> tuple[list[str], int]:
    """Media must stand alone in its own paragraph: `![..](..)` glued to text renders inline."""
    out, added = [], 0
    for i, line in enumerate(lines):
        is_media = bool(MD_MEDIA.match(line.strip())) and not line.startswith(' ')
        if is_media:
            prev = out[-1] if out else ''
            prev_in_lines = lines[i - 1] if i else ''
            if prev.strip() and not MD_MEDIA.match(prev.strip()) and not LISTISH.match(prev) and not LISTISH.match(prev_in_lines):
                out.append('')
                added += 1
        out.append(line)
        if is_media and not line.startswith(' '):
            nxt = lines[i + 1] if i + 1 < len(lines) else ''
            if nxt.strip() and not MD_MEDIA.match(nxt.strip()) and not LISTISH.match(nxt):
                out.append('')
                added += 1
    # collapse accidental triple blanks introduced by the passes
    tight = []
    for line in out:
        if not line.strip() and tight and not tight[-1].strip():
            continue
        tight.append(line)
    return tight, added


def main() -> int:
    args = sys.argv[1:]
    write = '--check' not in args
    targets = [a for a in args if not a.startswith('--')] or sorted(glob.glob('src/content/posts/*.md'))
    totals = {'images': 0, 'captions': 0, 'videos': 0, 'titles': 0, 'joined': 0, 'comments': 0, 'divs': 0, 'unstick': 0, 'grouped': 0, 'blanks': 0}
    for path in targets:
        raw = open(path, encoding='utf-8').read()
        lines = raw.split('\n')
        lines, n_split = pass_split_images(lines)
        lines, _, n_img = pass_images(lines)
        lines, n_cap = pass_captions(lines)
        lines, n_vid = pass_videos(lines)
        lines, n_title = pass_titles(lines)
        lines, n_split2 = pass_split_joined(lines)
        lines, n_comment = pass_strip_comments(lines)
        lines, n_div = pass_orphan_divs(lines)
        lines, n_unstick = pass_unstick_media(lines)
        lines, n_group = pass_join_groups(lines)
        lines, n_blank = pass_spacing(lines)
        new = '\n'.join(lines)
        totals['images'] += n_img
        totals['captions'] += n_cap
        totals['videos'] += n_vid
        totals['titles'] += n_title
        totals['joined'] += n_split2
        totals['comments'] += n_comment
        totals['divs'] += n_div
        totals['unstick'] += n_unstick
        totals['grouped'] += n_group
        totals['blanks'] += n_blank
        if write and new != raw:
            open(path, 'w', encoding='utf-8').write(new)
        if n_img or n_cap or n_vid or n_blank or n_split or n_title:
            print(f'{path}: img {n_img} / 图注 {n_cap} / video {n_vid} / 标题 {n_title} / 断行 {n_split} / 空行 {n_blank}')
    print('\n合计：' + '，'.join(f'{k} {v}' for k, v in totals.items()) + ('' if write else '（--check，未写入）'))
    return 0


if __name__ == '__main__':
    sys.exit(main())

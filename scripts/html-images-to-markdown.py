#!/usr/bin/env python3
"""Rewrite legacy HTML <img> blocks in posts as plain Markdown (see src/lib/markdown/media.mjs).

Legacy posts wrapped every screenshot in
    <div style="text-align: center;"><img src="…" alt="image" width="50%" height="auto"></div>
because the old site needed explicit widths. The new pipeline sizes figures by the image's own
orientation (landscape 80% / portrait 50% / square 60%), turns two or more images on
consecutive lines into a swipeable gallery, and adds click-to-zoom — so the HTML wrapper is
now noise, and every image should be a plain `![alt](src)`.

Rules (only these shapes exist in the legacy posts):
  * a line whose remaining markup is just the centered <div> wrapper, holding 1..n <img> ->
    one `![alt](src)` per image, consecutive lines (2+ = gallery)
  * a bare `<img …>` line -> `![alt](src)`
Adjacency is preserved: images already on neighbouring lines stay neighbours and become one
gallery, images separated by text or a blank line stay separate figures.

A legacy `alt="image"` carries no information, so it becomes an empty alt.
Usage: python3 scripts/html-images-to-markdown.py [--check] [paths…]
"""
import glob
import re
import sys

IMG = re.compile(r'<img\b[^>]*>', re.IGNORECASE)
SRC = re.compile(r'\bsrc\s*=\s*"([^"]+)"', re.IGNORECASE)
ALT = re.compile(r'\balt\s*=\s*"([^"]*)"', re.IGNORECASE)
# What may remain on the line around the images: the centered wrapper, nothing else.
WRAPPER_ONLY = re.compile(r'^(?:\s*<div\b[^>]*>|\s*</div>|\s*<p\b[^>]*>|\s*</p>|\s*<center>|\s*</center>)+$', re.IGNORECASE)
USELESS_ALT = {'', 'image', 'img', '图片', 'image.png', 'screenshot'}


def md_alt(raw: str | None) -> str:
    text = (raw or '').strip()
    if text.lower() in USELESS_ALT:
        return ''
    text = text.replace('[', '(').replace(']', ')').replace('\\', '/')
    return re.sub(r'\s+', ' ', text)


def convert_line(line: str) -> str | None:
    """Markdown replacement for a line holding images, or None to leave it untouched."""
    tags = IMG.findall(line)
    if not tags:
        return None
    rest = IMG.sub('', line).strip()
    if rest and not WRAPPER_ONLY.match(rest):
        return None  # images mixed with other markup/text: leave for a human
    out = []
    for tag in tags:
        src = SRC.search(tag)
        if not src:
            return None
        alt_match = ALT.search(tag)
        out.append('![%s](%s)' % (md_alt(alt_match.group(1) if alt_match else ''), src.group(1)))
    return '\n'.join(out)


def process(path: str, write: bool) -> tuple[int, int, list[str]]:
    lines = open(path, encoding='utf-8').read().split('\n')
    replaced = 0
    images = 0
    problems = []
    out = []
    for i, line in enumerate(lines, 1):
        if '<img' not in line.lower():
            out.append(line)
            continue
        new = convert_line(line)
        if new is None:
            problems.append(f'{path}:{i}: {line.strip()[:120]}')
            out.append(line)
            continue
        replaced += 1
        images += new.count('![')
        out.append(new)
    if write and replaced:
        open(path, 'w', encoding='utf-8').write('\n'.join(out))
    return replaced, images, problems


def main() -> int:
    args = [a for a in sys.argv[1:]]
    write = '--check' not in args
    targets = [a for a in args if not a.startswith('--')] or sorted(glob.glob('src/content/posts/*.md'))
    total_lines = total_images = 0
    problems = []
    for path in targets:
        n, imgs, probs = process(path, write)
        if n:
            print(f'{path}: {n} 行 -> {imgs} 个 Markdown 图片')
        total_lines += n
        total_images += imgs
        problems += probs
    print(f'\n合计：{total_lines} 行 HTML 换成 {total_images} 个 Markdown 图片' + ('' if write else '（--check，未写入）'))
    if problems:
        print(f'\n{len(problems)} 行无法自动判定（已跳过）：')
        for p in problems[:15]:
            print(' ', p)
    return 0


if __name__ == '__main__':
    sys.exit(main())

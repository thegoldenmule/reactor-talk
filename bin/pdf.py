#!/usr/bin/env python3
"""Build deck.pdf straight from outline.md + img/: one 1920x1080 page per slide.

No browser involved, so it cannot differ from the images the deck shows. Text-only slides
(title, closing) are typeset with Helvetica.
"""
import os, re
from PIL import Image, ImageDraw, ImageFont, JpegImagePlugin  # noqa: F401 (registers the encoder the PDF writer uses)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, BG = 1920, 1080, (14, 14, 13)
PAD_X, PAD_TOP, PAD_BOTTOM, TITLE_PX, GAP = 64, 48, 48, 44, 28   # same geometry as build.mjs

def parse(md):
    slides, cur, stop = [], None, False
    for line in md.split("\n"):
        if re.match(r"^## (Gaps|Likely)", line): stop = True
        if stop: break
        m = re.match(r"^### (.+)", line)
        if m:
            cur = {"title": m.group(1).strip(), "image": None, "text": []}; slides.append(cur); continue
        if line.startswith("#"): cur = None; continue
        if not cur or line.strip() == "---": continue
        m = re.match(r"^!\[.*?\]\((img/[\w-]+\.png)\)", line)
        if m and not cur["image"]: cur["image"] = m.group(1); continue
        if line.startswith("- ") or re.match(r"^\s{2,}\S", line) or not line.strip(): continue
        cur["text"].append(line.strip())
    return slides

def font(size):
    for f in ("/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        if os.path.exists(f):
            try: return ImageFont.truetype(f, size)
            except OSError: pass
    return ImageFont.load_default()

def page(slide):
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((PAD_X, PAD_TOP), slide["title"], fill=(255, 255, 255), font=font(TITLE_PX))
    top = PAD_TOP + round(TITLE_PX * 1.15) + GAP
    box_w, box_h = W - 2 * PAD_X, H - top - PAD_BOTTOM
    if slide["image"]:
        art = Image.open(os.path.join(ROOT, slide["image"])).convert("RGB")
        s = min(box_w / art.width, box_h / art.height)
        art = art.resize((round(art.width * s), round(art.height * s)), Image.LANCZOS)
        im.paste(art, (PAD_X + (box_w - art.width) // 2, top + (box_h - art.height) // 2))
        return im
    sub = " ".join(slide["text"])
    if sub:
        sf = font(48); sw = d.textlength(sub, font=sf)
        d.text((PAD_X + (box_w - sw) / 2, top + box_h / 2 - 24), sub, fill=(153, 153, 153), font=sf)
    return im

slides = parse(open(os.path.join(ROOT, "outline.md"), encoding="utf8").read())
pages = [page(s) for s in slides]
out = os.path.join(ROOT, "deck.pdf")
pages[0].save(out, save_all=True, append_images=pages[1:], resolution=144, quality=95)
print(f"wrote deck.pdf: {len(pages)} pages")

#!/usr/bin/env python3
"""Render ph-diagrams pages to crisp, card-cropped PNGs for the deck.

usage: bin/render-diagrams.py [page-id ...]

Reads ../ph-diagrams (override with PH_DIAGRAMS), writes img/. With no ids,
renders every diagram referenced by outline.md.
"""
import json, os, subprocess, sys, tempfile
from PIL import Image, ImageChops

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCALE = 2
PAD = 24  # css px of dark margin kept around the card
BG = (14, 14, 13)

def render(src, out_dir, ids):
    manifest = json.load(open(os.path.join(src, "manifest.json")))
    pages = {p["id"]: p for p in manifest["pages"]}
    os.makedirs(out_dir, exist_ok=True)
    for pid in ids:
        p = pages[pid]
        vp = p.get("viewport", manifest["defaultViewport"])
        w = vp["width"]; h = max(vp["height"], 2400)  # tall window; card is height:auto and gets cropped
        url = "file://" + os.path.abspath(os.path.join(src, p["path"]))
        with tempfile.TemporaryDirectory() as td:
            raw = os.path.join(td, "raw.png")
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                            f"--force-device-scale-factor={SCALE}", f"--window-size={w},{h}",
                            "--virtual-time-budget=8000", f"--screenshot={raw}", url],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            im = Image.open(raw).convert("RGB")
        diff = ImageChops.difference(im, Image.new("RGB", im.size, BG)).convert("L")
        bbox = diff.point(lambda v: 255 if v > 14 else 0).getbbox()
        if not bbox:
            print(f"!! {pid}: nothing rendered"); continue
        pad = PAD * SCALE
        box = (max(bbox[0]-pad, 0), max(bbox[1]-pad, 0), min(bbox[2]+pad, im.width), min(bbox[3]+pad, im.height))
        im.crop(box).save(os.path.join(out_dir, f"{pid}.png"), optimize=True)
        print(f"{pid}: {box[2]-box[0]}x{box[3]-box[1]}")

if __name__ == "__main__":
    import re
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = os.environ.get("PH_DIAGRAMS", os.path.join(here, "..", "ph-diagrams"))
    out = os.path.join(here, "img")
    ids = sys.argv[1:] or sorted(set(re.findall(r"\]\(img/([\w-]+)\.png\)", open(os.path.join(here, "outline.md")).read())))
    render(src, out, ids)

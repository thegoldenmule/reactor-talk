# The Reactor — talk

A 20-minute, diagram-only deck about Powerhouse's local-first document runtime, built for a
"present a recent technical project" interview round. Slides carry essentially no text; the
narrative lives in **`outline.md`**, which is also the deck's source.

```
outline.md          The outline + speaker notes. Edit this. `###` = one slide.
index.html          Generated deck (reveal.js). Don't edit; run `npm run build`.
img/                Diagrams, rendered at 2x from ../ph-diagrams and committed.
bin/build.mjs       outline.md → index.html
bin/render-diagrams.py   ../ph-diagrams/pages/*.html → img/*.png (headless Chrome + Pillow crop)
bin/pdf.py          outline.md + img/ → deck.pdf (backup for a dead browser; no browser involved)
reveal/             Vendored reveal.js dist — works offline, no npm install needed to present.
```

## Present

```
npm run serve        # http://127.0.0.1:7788/
```

Open it in Chrome, press `F` for fullscreen and `S` for the speaker view (notes + timer + next
slide). Share the **fullscreen window**, not the whole screen, so the speaker view stays private.
Arrow keys / space advance. `Esc` shows the overview. `?` lists shortcuts.

Backup: `deck.pdf` opened fullscreen in Preview.

## Edit

1. Change `outline.md` (notes, order, which diagram each slide uses).
2. `npm run build`.
3. Need a diagram changed? Edit it in `../ph-diagrams/pages/`, then `npm run render` (or
   `python3 bin/render-diagrams.py <page-id>` for one). Set `PH_DIAGRAMS=/path` if the diagram
   repo lives elsewhere.
4. `npm run pdf` to refresh the backup.

The render and PDF scripts depend on Python 3 with Pillow (`pip install pillow`); rendering also
needs Google Chrome.app.

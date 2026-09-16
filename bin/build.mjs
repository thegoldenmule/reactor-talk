#!/usr/bin/env node
// Build index.html (a reveal.js deck) from outline.md.
//
// Rules:
//   `### Heading`            starts a slide. The heading is the slide title, pinned to the
//                            top-left of the page (outside reveal's scaled slide area).
//   `![alt](img/x.png)`      the slide's diagram, fitted into the area under the title. Slides
//                            without an image show their plain paragraphs centered instead.
//   `- bullet` / paragraphs  become speaker notes (press S in the deck).
//   `##` / `#` headings, `---` rules and everything before the first `###` are ignored.
//   The `## Appendix` section and anything after it still produce slides; sections after
//   `## Gaps` / `## Likely` do not (they are prep notes, not slides).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const md = readFileSync(join(root, "outline.md"), "utf8");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

// ---- parse -------------------------------------------------------------------------------
const slides = [];
let cur = null;
let stop = false;
for (const raw of md.split("\n")) {
  const line = raw.replace(/\s+$/, "");
  if (/^## (Gaps|Likely)/.test(line)) stop = true;
  if (stop) break;
  const h3 = line.match(/^### (.+)/);
  if (h3) {
    cur = { title: h3[1].trim(), image: null, alt: "", notes: [], text: [] };
    slides.push(cur);
    continue;
  }
  if (/^#/.test(line)) { cur = null; continue; } // any other heading ends the current slide
  if (!cur || line === "---") continue;
  const img = line.match(/^!\[(.*?)\]\((img\/[\w-]+\.png)\)/);
  if (img && !cur.image) {
    cur.image = img[2];
    cur.alt = img[1];
    continue;
  }
  const bullet = line.match(/^- (.*)/);
  if (bullet) {
    cur.notes.push(bullet[1]);
    continue;
  }
  if (/^\s{2,}\S/.test(line) && cur.notes.length) {
    cur.notes[cur.notes.length - 1] += " " + line.trim();
    continue;
  }
  if (line.trim()) cur.text.push(line.trim());
}

// ---- render ------------------------------------------------------------------------------
const section = (s, i) => {
  const notes = s.notes.length
    ? `<aside class="notes"><h4>${inline(s.title)}</h4><ul>${s.notes
        .map((n) => `<li>${inline(n)}</li>`)
        .join("")}</ul></aside>`
    : `<aside class="notes"><h4>${inline(s.title)}</h4></aside>`;
  const attrs = `data-slide="${i + 1}" data-title="${esc(s.title)}"`;
  if (s.image) {
    return `<section ${attrs}><div class="art"><img src="${s.image}" alt="${esc(s.alt)}"></div>${notes}</section>`;
  }
  const body = s.text.map((t) => `<p>${inline(t)}</p>`).join("");
  return `<section ${attrs}><div class="art text">${body}</div>${notes}</section>`;
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Reactor</title>
  <link rel="stylesheet" href="reveal/reset.css">
  <link rel="stylesheet" href="reveal/reveal.css">
  <link rel="stylesheet" href="reveal/theme/black.css">
  <style>
    :root { --r-background-color: #0e0e0d; }
    html, body, .reveal-viewport, .reveal { background: #0e0e0d; }
    .reveal { font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
    /* the title lives outside reveal's scaled slide, pinned to the page's top-left corner */
    .deck-title {
      position: fixed; top: 28px; left: 40px; z-index: 20; pointer-events: none;
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: clamp(20px, 2.1vw, 40px); line-height: 1.2; font-weight: 600;
      letter-spacing: -0.02em; color: #fff;
    }
    /* the slide itself: diagram fitted into the area below the title band */
    .reveal .slides section { top: 0; height: 1080px; padding: 0; text-align: left; }
    .reveal .art { position: absolute; top: 120px; right: 48px; bottom: 40px; left: 48px; display: flex; align-items: center; justify-content: center; }
    .reveal .art img { max-width: 100%; max-height: 100%; width: auto; height: auto; margin: 0; border: 0; box-shadow: none; background: none; }
    .reveal .art.text { flex-direction: column; text-align: center; }
    .reveal .art.text p { font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; font-size: 48px; color: rgba(255,255,255,0.6); margin: 0 0 0.4em; max-width: 1400px; }
    /* keep the slide number as the only chrome, and tiny */
    .reveal .slide-number { background: transparent; color: rgba(255,255,255,0.25); font-size: 12px; }
    /* pdf export: one slide per page, dark background preserved */
    @media print {
      @page { size: 1920px 1080px; margin: 0; }
      html, body { background: #0e0e0d !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <div class="deck-title" id="deck-title"></div>
  <div class="reveal">
    <div class="slides">
${slides.map(section).map((s) => "      " + s).join("\n")}
    </div>
  </div>
  <script src="reveal/reveal.js"></script>
  <script src="reveal/plugin/notes.js"></script>
  <script>
    Reveal.initialize({
      width: 1920, height: 1080, margin: 0.04,
      controls: false, progress: false, center: false, hash: true,
      transition: 'none', backgroundTransition: 'none',
      slideNumber: 'c/t', showSlideNumber: 'speaker',
      preloadIframes: true,
      pdfMaxPagesPerSlide: 1, pdfSeparateFragments: false,
      plugins: [ RevealNotes ]
    });
    (function () {
      var el = document.getElementById('deck-title');
      var set = function () { var s = Reveal.getCurrentSlide(); el.textContent = s ? (s.dataset.title || '') : ''; };
      Reveal.on('ready', set); Reveal.on('slidechanged', set);
    })();
  </script>
</body>
</html>
`;
writeFileSync(join(root, "index.html"), html);
console.log(`wrote index.html: ${slides.length} slides (${slides.filter((s) => s.image).length} diagrams)`);
for (const s of slides) if (!s.image && !s.text.length) console.warn(`  note: "${s.title}" has no image and no text`);

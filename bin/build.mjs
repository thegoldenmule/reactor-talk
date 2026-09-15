#!/usr/bin/env node
// Build index.html (a reveal.js deck) from outline.md.
//
// Rules:
//   `### Heading`            starts a slide. The heading is NOT rendered on the slide unless the
//                            slide has no image (title/closing slides), in which case the heading
//                            and any plain paragraphs are shown centered.
//   `![alt](img/x.png)`      the slide's diagram, shown as a contained full-bleed background.
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
  if (s.image) {
    return `<section data-slide="${i + 1}" data-background-image="${s.image}" data-background-size="contain" data-background-color="#0e0e0d" aria-label="${esc(s.alt)}">${notes}</section>`;
  }
  const body = s.text.map((t) => `<p>${inline(t)}</p>`).join("");
  return `<section data-slide="${i + 1}" class="text-slide"><h1>${inline(s.title)}</h1>${body}${notes}</section>`;
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
    /* never paint .slides: it sits in front of the background layer that carries the diagrams */
    .reveal .slides section { padding: 0; }
    .reveal .text-slide { text-align: center; }
    .reveal .text-slide h1 {
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 700; letter-spacing: -0.02em; font-size: 2.6em; text-transform: none;
      color: #fff; margin-bottom: 0.3em;
    }
    .reveal .text-slide p {
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      color: rgba(255,255,255,0.6); font-size: 1.1em;
    }
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
      controls: false, progress: false, center: true, hash: true,
      transition: 'none', backgroundTransition: 'none',
      slideNumber: 'c/t', showSlideNumber: 'speaker',
      preloadIframes: true,
      pdfMaxPagesPerSlide: 1, pdfSeparateFragments: false,
      plugins: [ RevealNotes ]
    });
  </script>
</body>
</html>
`;
writeFileSync(join(root, "index.html"), html);
console.log(`wrote index.html: ${slides.length} slides (${slides.filter((s) => s.image).length} diagrams)`);
for (const s of slides) if (!s.image && !s.text.length) console.warn(`  note: "${s.title}" has no image and no text`);

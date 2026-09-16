#!/usr/bin/env node
// Build index.html (a reveal.js deck) from outline.md.
//
// Rules:
//   `### Heading`            starts a slide. The heading becomes the slide's header band; the
//                            enclosing `##` heading is shown as the section label on the right.
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
let sectionName = "";
for (const raw of md.split("\n")) {
  const line = raw.replace(/\s+$/, "");
  if (/^## (Gaps|Likely)/.test(line)) stop = true;
  if (stop) break;
  const h2 = line.match(/^## (.+)/);
  if (h2) sectionName = h2[1].replace(/\s*\(.*\)\s*$/, "").trim();
  const h3 = line.match(/^### (.+)/);
  if (h3) {
    cur = { title: h3[1].trim(), section: sectionName, image: null, alt: "", notes: [], text: [] };
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
  const header = `<header class="hd"><h2>${inline(s.title)}</h2><span class="sec">${inline(s.section)}</span></header>`;
  if (s.image) {
    return `<section data-slide="${i + 1}">${header}<div class="art"><img src="${s.image}" alt="${esc(s.alt)}"></div>${notes}</section>`;
  }
  const body = s.text.map((t) => `<p>${inline(t)}</p>`).join("");
  return `<section data-slide="${i + 1}">${header}<div class="art text">${body}</div>${notes}</section>`;
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
    .reveal .slides section { top: 0; height: 1080px; padding: 0; text-align: left; }
    /* header band: title left, section right, hairline divider with a cyan accent */
    .reveal .hd {
      position: absolute; top: 0; left: 0; right: 0; height: 112px;
      margin: 0 72px; padding-top: 34px; box-sizing: border-box;
      display: flex; align-items: baseline; justify-content: space-between;
      border-bottom: 1px solid rgba(255,255,255,0.14);
    }
    .reveal .hd::after {
      content: ""; position: absolute; left: 0; bottom: -2px; width: 64px; height: 3px;
      background: #04d9eb; border-radius: 2px;
    }
    .reveal .hd h2 {
      margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 42px; line-height: 1.1; font-weight: 600; letter-spacing: -0.02em;
      text-transform: none; color: #fff; text-shadow: none;
    }
    .reveal .hd .sec {
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 16px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
      color: rgba(255,255,255,0.38);
    }
    /* diagram fitted into the area under the header */
    .reveal .art { position: absolute; top: 140px; right: 72px; bottom: 44px; left: 72px; display: flex; align-items: center; justify-content: center; }
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
  <div class="reveal">
    <div class="slides">
${slides.map(section).map((s) => "      " + s).join("\n")}
    </div>
  </div>
  <script src="reveal/reveal.js"></script>
  <script src="reveal/plugin/notes.js"></script>
  <script>
    Reveal.initialize({
      width: 1920, height: 1080, margin: 0.02,
      controls: false, progress: false, center: false, hash: true,
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

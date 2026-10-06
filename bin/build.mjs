#!/usr/bin/env node
// Build the deck from outline.md. One command does everything:
//   1. copies the diagram sources this deck uses out of ../ph-diagrams (override with
//      PH_DIAGRAMS) into docs/diagrams/pages/ and docs/diagrams/css/, byte for byte, along with
//      pages/assets/ (screenshots that diagram pages embed);
//   2. writes docs/index.html (a reveal.js deck) that shows each diagram page live in an iframe,
//      scaled to fit under the slide header. No PNG rendering anywhere.
//
// Outline rules:
//   `### Heading`            starts a slide. The heading becomes the slide's header band; the
//                            enclosing `##` heading is shown as the section label on the right.
//   `![alt](img/<id>.png)`   the slide's diagram: <id> names ../ph-diagrams/pages/<id>.html.
//                            (The img/ spelling is kept for outline compatibility; no PNG is
//                            read.) Slides without a diagram show their plain paragraphs centered.
//   `- bullet` / paragraphs  become speaker notes (press S in the deck).
//   A `###` with no diagram and no paragraphs is a section divider: just its title, centered,
//                            with no header band.
//   `##` / `#` headings, `---` rules and everything before the first `###` are ignored.
//   The `## Appendix` section and anything after it still produce slides; sections after
//   `## Gaps` / `## Likely` do not (they are prep notes, not slides).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIAGRAMS = process.env.PH_DIAGRAMS || join(root, "..", "ph-diagrams");
const md = readFileSync(join(root, "outline.md"), "utf8");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    cur = { title: h3[1].trim(), section: sectionName, diagram: null, alt: "", notes: [], text: [] };
    slides.push(cur);
    continue;
  }
  if (/^#/.test(line)) { cur = null; continue; } // any other heading ends the current slide
  if (!cur || line === "---") continue;
  const img = line.match(/^!\[(.*?)\]\(img\/([\w-]+)\.png\)/);
  if (img && !cur.diagram) {
    cur.diagram = img[2];
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

// ---- diagram sources ---------------------------------------------------------------------
const manifestPath = join(DIAGRAMS, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`diagram repo not found at ${DIAGRAMS} (set PH_DIAGRAMS)`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const widthOf = new Map(manifest.pages.map((p) => [p.id, (p.viewport || manifest.defaultViewport).width]));
const used = [...new Set(slides.filter((s) => s.diagram).map((s) => s.diagram))];

const missing = used.filter((id) => !existsSync(join(DIAGRAMS, "pages", `${id}.html`)));
if (missing.length) {
  console.error(`missing diagram page(s) in ${join(DIAGRAMS, "pages")}: ${missing.join(", ")}`);
  process.exit(1);
}
for (const id of used) if (!widthOf.has(id)) console.warn(`  note: "${id}" is not in manifest.json; using default viewport width`);

const site = join(root, "docs");
const pagesDir = join(site, "diagrams", "pages");
const cssDir = join(site, "diagrams", "css");
mkdirSync(pagesDir, { recursive: true });
mkdirSync(cssDir, { recursive: true });
for (const f of readdirSync(join(DIAGRAMS, "css"))) if (f.endsWith(".css")) copyFileSync(join(DIAGRAMS, "css", f), join(cssDir, f));
for (const id of used) copyFileSync(join(DIAGRAMS, "pages", `${id}.html`), join(pagesDir, `${id}.html`));
// Only the page HTML is copied above, so a page that shows a screenshot (<img src="assets/x.png">)
// would 404 in the deck. Copy the shared assets directory alongside the pages if it exists.
const assetsSrc = join(DIAGRAMS, "pages", "assets");
if (existsSync(assetsSrc)) {
  const assetsDst = join(pagesDir, "assets");
  mkdirSync(assetsDst, { recursive: true });
  const assets = readdirSync(assetsSrc, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name);
  for (const name of assets) copyFileSync(join(assetsSrc, name), join(assetsDst, name));
  for (const e of readdirSync(assetsDst, { withFileTypes: true }))
    if (e.isFile() && !assets.includes(e.name)) unlinkSync(join(assetsDst, e.name));
}
for (const f of readdirSync(pagesDir)) {
  const id = f.replace(/\.html$/, "");
  if (f.endsWith(".html") && !used.includes(id)) unlinkSync(join(pagesDir, f));
}

// ---- render ------------------------------------------------------------------------------
const section = (s, i) => {
  const notes = s.notes.length
    ? `<aside class="notes"><h4>${inline(s.title)}</h4><ul>${s.notes
        .map((n) => `<li>${inline(n)}</li>`)
        .join("")}</ul></aside>`
    : `<aside class="notes"><h4>${inline(s.title)}</h4></aside>`;
  const header = `<header class="hd"><h2>${inline(s.title)}</h2><span class="sec">${inline(s.section)}</span></header>`;
  if (s.diagram) {
    const w = widthOf.get(s.diagram) ?? manifest.defaultViewport.width;
    return `<section data-slide="${i + 1}">${header}<div class="art"><div class="fit"><iframe src="diagrams/pages/${s.diagram}.html" data-w="${w}" style="width:${w}px" scrolling="no" title="${esc(s.alt)}"></iframe></div></div>${notes}</section>`;
  }
  if (!s.text.length) {
    // Section divider: the title alone, centered, no header band.
    // The header band stays (hairline + cyan tick), but empty — the title moves to the centre.
    return `<section data-slide="${i + 1}" class="divider"><header class="hd"></header><div class="mid"><h2>${inline(s.title)}</h2></div>${notes}</section>`;
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
      position: absolute; top: 0; left: 0; right: 0; height: 136px;
      margin: 0 72px; padding-top: 30px; box-sizing: border-box;
      display: flex; flex-direction: column; align-items: flex-start;
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
      order: -1;
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 20px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      color: #04d9eb;
      line-height: 24px; min-height: 24px; margin-bottom: 8px;
    }
    /* diagram fitted into the area under the header: the page is embedded unscaled in an
       iframe inside .fit, and .fit is scaled/positioned by the script below */
    .reveal .art { position: absolute; top: 164px; right: 72px; bottom: 44px; left: 72px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .reveal .art .fit { position: absolute; left: 0; top: 0; transform-origin: top left; }
    .reveal .art iframe { border: 0; background: transparent; pointer-events: none; display: block; margin: 0; max-width: none; max-height: none; box-shadow: none; }
    .reveal .art.text { flex-direction: column; text-align: center; }
    .reveal .art.text p { font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; font-size: 48px; color: rgba(255,255,255,0.6); margin: 0 0 0.4em; max-width: 1400px; }
    /* section divider: title centered on an otherwise empty frame */
    /* reveal forces display:block on the current section, so the centering lives on .mid.
       .mid takes the same box as .art, so the title sits where a diagram would. */
    .reveal .divider .mid {
      position: absolute; top: 164px; right: 72px; bottom: 44px; left: 72px;
      display: flex; align-items: center; justify-content: center; text-align: center;
    }
    .reveal .divider h2 {
      margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 96px; line-height: 1.1; font-weight: 600; letter-spacing: -0.02em;
      text-transform: none; color: #fff; text-shadow: none;
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
      width: 1920, height: 1080, margin: 0.02,
      controls: false, progress: false, center: false, hash: true,
      transition: 'none', backgroundTransition: 'none',
      slideNumber: 'c/t', showSlideNumber: 'speaker',
      preloadIframes: true,
      pdfMaxPagesPerSlide: 1, pdfSeparateFragments: false,
      plugins: [ RevealNotes ]
    });

    // Fit each diagram iframe into the art box (1776 x 872 slide units, see .art above).
    // The iframe already carries its design width inline so pages lay out (and draw any
    // JS overlays) at the right width on first load.
    // The iframe is sized to the page's design width and its card height (+24px above and
    // below, as the page's .frame padding gives), then .fit is scaled to fit and centered.
    (function () {
      var BOX_W = 1776, BOX_H = 872, PAD = 48;
      function fit(iframe) {
        var doc = iframe.contentDocument;
        var card = doc && doc.querySelector('.card');
        if (!card) return;
        var w = parseInt(iframe.dataset.w, 10) || 1200;
        var h = card.offsetHeight + PAD;
        if (!h || h === PAD) return;
        var s = Math.min(BOX_W / w, BOX_H / h);
        iframe.style.width = w + 'px';
        iframe.style.height = h + 'px';
        var box = iframe.parentNode;
        box.style.width = w + 'px';
        box.style.height = h + 'px';
        box.style.transform = 'scale(' + s + ')';
        box.style.left = ((BOX_W - w * s) / 2) + 'px';
        box.style.top = ((BOX_H - h * s) / 2) + 'px';
        // pages that draw overlays with JS on load/resize (arrows) redraw against the final size
        if (iframe.contentWindow && (iframe.dataset.h !== String(h))) {
          iframe.dataset.h = String(h);
          try { iframe.contentWindow.dispatchEvent(new Event('resize')); } catch (e) {}
        }
      }
      function fitCurrent() {
        var slide = Reveal.getCurrentSlide();
        if (!slide) return;
        slide.querySelectorAll('.art iframe').forEach(fit);
      }
      document.querySelectorAll('.art iframe').forEach(function (f) {
        f.addEventListener('load', function () { fit(f); });
        if (f.contentDocument && f.contentDocument.readyState === 'complete') fit(f);
      });
      Reveal.on('ready', fitCurrent);
      Reveal.on('slidechanged', fitCurrent);
      Reveal.on('resize', fitCurrent);
    })();
  </script>
</body>
</html>
`;
writeFileSync(join(site, "index.html"), html);
console.log(`wrote docs/index.html: ${slides.length} slides (${slides.filter((s) => s.diagram).length} diagrams, ${used.length} pages copied)`);
const dividers = slides.filter((s) => !s.diagram && !s.text.length).map((s) => s.title);
if (dividers.length) console.log(`  dividers: ${dividers.join(", ")}`);

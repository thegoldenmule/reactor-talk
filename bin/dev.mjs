#!/usr/bin/env node
// Dev loop: serve the deck, rebuild when outline.md changes, re-render a diagram when its
// source page in ../ph-diagrams changes, and reload the browser tab after either.
//
//   npm run dev        → http://127.0.0.1:7788/
//
// No dependencies. Reload is a server-sent event; the client script is injected into
// index.html at serve time, so the committed index.html stays clean.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, watch } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, extname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const diagrams = process.env.PH_DIAGRAMS || join(root, "..", "ph-diagrams");
const port = Number(process.env.PORT || 7788);

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".pdf": "application/pdf" };

const client = `<script>
(function () {
  var es = new EventSource("/__events");
  es.onmessage = function (e) { if (e.data === "reload") location.reload(); };
  es.onerror = function () { /* server restarting; EventSource retries on its own */ };
})();
</script>`;

const clients = new Set();
const broadcast = () => { for (const res of clients) res.write("data: reload\n\n"); };

const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/__events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write("retry: 500\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }
  let file = resolve(root, "." + (url === "/" ? "/index.html" : url));
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  const type = types[extname(file)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  if (basename(file) === "index.html") {
    res.end(readFileSync(file, "utf8").replace("</body>", client + "\n</body>"));
  } else {
    res.end(readFileSync(file));
  }
});

// ---- watchers -----------------------------------------------------------------------------
const run = (cmd, args, label) =>
  new Promise((done) => {
    const t = Date.now();
    const p = spawn(cmd, args, { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
    p.on("exit", (code) => { console.log(`  ${label} ${code === 0 ? "ok" : "FAILED"} (${Date.now() - t} ms)`); done(code === 0); });
  });

let timer = null, pendingBuild = false, pendingPages = new Set(), busy = false;
async function flush() {
  if (busy) { timer = setTimeout(flush, 100); return; }
  busy = true;
  try {
    if (pendingPages.size) {
      const ids = [...pendingPages]; pendingPages.clear();
      console.log(`render ${ids.join(", ")}`);
      await run("python3", ["bin/render-diagrams.py", ...ids], "render");
    }
    if (pendingBuild) {
      pendingBuild = false;
      console.log("build");
      await run("node", ["bin/build.mjs"], "build");
    }
  } finally { busy = false; }
  broadcast();
}
const schedule = () => { clearTimeout(timer); timer = setTimeout(flush, 150); };

watch(root, { recursive: true }, (_, name) => {
  if (!name) return;
  const n = String(name);
  if (n.startsWith("node_modules") || n.startsWith(".git") || n.startsWith("reveal")) return;
  if (n === "outline.md" || n === "bin/build.mjs") { pendingBuild = true; schedule(); }
  else if (n.startsWith("img/") && n.endsWith(".png")) schedule();   // re-rendered diagram: just reload
});

const pagesDir = join(diagrams, "pages");
if (existsSync(pagesDir)) {
  const used = () => new Set([...readFileSync(join(root, "outline.md"), "utf8").matchAll(/\]\(img\/([\w-]+)\.png\)/g)].map((m) => m[1]));
  watch(pagesDir, (_, name) => {
    if (!name || !String(name).endsWith(".html")) return;
    const id = basename(String(name), ".html");
    if (used().has(id)) { pendingPages.add(id); schedule(); }
  });
  watch(join(diagrams, "css"), () => { for (const id of used()) pendingPages.add(id); schedule(); });
  console.log(`watching diagram sources in ${pagesDir}`);
} else {
  console.log(`no diagram repo at ${diagrams}; only outline.md is watched`);
}

server.listen(port, "127.0.0.1", () => {
  console.log(`deck at http://127.0.0.1:${port}/  (S = speaker view, F = fullscreen)`);
  console.log("watching outline.md and img/ — save to rebuild and reload");
});

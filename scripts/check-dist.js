// Runs after `vite build`. Fails the build if the output would not deploy cleanly to Cloudflare.
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MAX = 25 * 1024 * 1024;      // Cloudflare per-file limit
const MAX_FILES = 20000;           // Cloudflare Pages file-count limit (free plan)
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk("dist");

let fail = false;
for (const f of files) {
  const size = statSync(f).size;
  if (size > MAX) { console.log(`x ${f} is ${size} bytes (limit 25 MiB)`); fail = true; }
  if (/\.(php|py|cgi)$/.test(f) || f.endsWith("_worker.js") || f.includes("/functions/")) { console.log(`x ${f} is not a static file`); fail = true; }
}
if (files.length > MAX_FILES) { console.log(`x ${files.length} files (limit ${MAX_FILES})`); fail = true; }
for (const need of ["dist/index.html", "dist/_headers", "dist/_redirects", "dist/pyodide/pyodide.asm.wasm"]) {
  if (!files.includes(need)) { console.log(`x missing ${need}`); fail = true; }
}
// The emulator test hook must never ship.
for (const f of files.filter((f) => f.endsWith(".js"))) {
  if (readFileSync(f, "utf8").includes("__signInForTest")) { console.log(`x ${f} contains the emulator test hook`); fail = true; }
}
const js = files.filter((f) => /dist\/assets\/.*\.js$/.test(f)).reduce((n, f) => n + statSync(f).size, 0);
console.log(`${fail ? "!" : "ok"} dist: ${files.length} files, app JavaScript ${(js / 1024).toFixed(0)} KB (before compression)`);
process.exit(fail ? 1 : 0);

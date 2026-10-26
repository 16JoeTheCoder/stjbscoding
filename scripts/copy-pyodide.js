// Copies the Python runtime (Pyodide) from node_modules into public/pyodide so it is served
// from our own site. Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, mkdirSync, statSync } from "node:fs";

const FILES = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const MAX_BYTES = 25 * 1024 * 1024; // Cloudflare's per-file limit for static assets

mkdirSync("public/pyodide", { recursive: true });
for (const f of FILES) {
  const from = `node_modules/pyodide/${f}`;
  const size = statSync(from).size;
  if (size > MAX_BYTES) throw new Error(`${f} is ${size} bytes, over Cloudflare's 25 MiB per-file limit`);
  cpSync(from, `public/pyodide/${f}`);
}
console.log("ok pyodide copied to public/pyodide");

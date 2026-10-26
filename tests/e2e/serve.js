// Tiny static server for the end-to-end tests. Serves a built folder and applies the
// "/*" headers from its _headers file, like Cloudflare does, so the tests run under the
// real Content-Security-Policy. The only change: connect-src also allows the local emulators.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm",
  ".json": "application/json", ".zip": "application/zip", ".woff2": "font/woff2", ".svg": "image/svg+xml" };

export function parseHeaders(text) {
  const blocks = {};
  let path = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!line.startsWith(" ")) { path = line.trim(); blocks[path] = {}; continue; }
    const i = line.indexOf(":");
    blocks[path][line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return blocks;
}

export function serve(dir, port) {
  const headers = parseHeaders(readFileSync(join(dir, "_headers"), "utf8"))["/*"];
  headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace("connect-src", "connect-src http://127.0.0.1:9099 http://127.0.0.1:8080");
  const server = createServer((req, res) => {
    let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p.endsWith("/")) p += "index.html";
    const file = join(dir, p);
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { ...headers, "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

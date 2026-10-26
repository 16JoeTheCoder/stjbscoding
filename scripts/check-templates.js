// Design lint for the lit-html templates in src/**/*.js, which scripts/jy-check.sh (from the
// design system) does not scan. Flags what DESIGN.md forbids. Run: npm run design:check
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CHECKS = [
  ["raw hex colour (use var(--token))", /#[0-9a-fA-F]{3,8}\b(?![^`]*\$\{)/, (line) => !/href=|["'`]#[/a-z]|#\$\{/.test(line)],
  ["font-weight outside 300 400 500 700", /font-weight:\s*(100|200|600|800|900)\b/],
  ["gradient, blur or text-shadow", /gradient\(|backdrop-filter|text-shadow|blur\(/],
  ["inline pixel style (use a token class)", /style="[^"]*\d+px/],
  ["exclamation mark in UI text", />[^<{]*[A-Za-z]![ <]/],
  ["emoji", /\p{Extended_Pictographic}/u],
  ["small button below the 44px touch target", /jy-btn--s\b/],
];

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (p.includes("src/design")) return;
  statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p);
});
walk("src");

let fail = 0;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (line.trim().startsWith("//")) return;
    for (const [label, re, keep = () => true] of CHECKS) {
      if (re.test(line) && keep(line)) { console.log(`x ${label}\n${f}:${i + 1}: ${line.trim()}`); fail = 1; }
    }
  });
}
console.log(fail ? "! fix the lines above" : `ok templates clean (${files.length} files)`);
process.exit(fail);

// Hash router: "#/class/abc/roster" -> the class page with params { id: "abc", tab: "roster" }.
// Hash routes need no server rewrite rules, so the site works the same on any static host
// (DECISIONS.md D10).
//
// A page is an async function that loads its data and returns a render function:
//   export default async function page(ctx) { const data = await load(); return () => html`...`; }
// ctx: { params, query, me, rerender, reload, go }. Call ctx.rerender() after changing page state.
import { render } from "lit-html";
import { shell, loading, problem, friendlyError } from "./ui.js";

let routes = [];
let me = null;
let current = null;   // { draw } for the page on screen
let navSeq = 0;
const root = () => document.getElementById("app");

export function startRouter(table, profile) {
  routes = table.map(([pattern, load, roles]) => ({ parts: pattern.split("/").filter(Boolean), load, roles }));
  me = profile;
  window.onhashchange = show;
  show();
}

export const go = (path) => { location.hash = "#" + path; };
export const reload = () => show();

function match(path) {
  const parts = path.split("/").filter(Boolean);
  for (const r of routes) {
    const params = {};
    const ok = r.parts.length >= parts.length && r.parts.every((p, i) => {
      if (p.startsWith(":")) {
        if (parts[i] === undefined) return p.endsWith("?");
        params[p.replace(/[:?]/g, "")] = decodeURIComponent(parts[i]);
        return true;
      }
      return p === parts[i];
    });
    if (ok) return { route: r, params };
  }
  return null;
}

async function show() {
  const seq = ++navSeq;
  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const found = match(path);
  const draw = (body) => render(shell(me, path, body), root());
  const finish = (body) => { draw(body); document.documentElement.dataset.page = location.hash; };   // lets tests wait for the page
  if (!found) return finish(problem("Page not found.", "Check the link, or go back to This week."));
  if (found.route.roles && !found.route.roles.includes(me.role)) return finish(problem("This page is not available for your role."));

  draw(loading());
  const ctx = {
    params: found.params,
    query: Object.fromEntries(new URLSearchParams(qs || "")),
    me,
    go,
    reload,
    rerender: () => { if (current?.seq === seq) current.paint(); },
  };
  try {
    const view = await found.route.load(ctx);
    if (seq !== navSeq) return;   // the user navigated away while this page loaded
    current = { seq, paint: () => draw(view()) };
    finish(view());
    window.scrollTo(0, 0);
  } catch (e) {
    if (seq !== navSeq) return;
    if (!String(e?.code).includes("permission-denied")) console.error(e);
    finish(problem(friendlyError(e)));
  }
}




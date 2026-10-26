// Shared pieces of page layout, built from the builtbyjosef design system classes
// (jy-btn, jy-panel, jy-badge, jy-table, jy-field). No colours or sizes are invented here.
import { html, nothing } from "lit-html";

const NAV = {
  student: [["/", "This week"], ["/dashboard", "Dashboard"], ["/join", "Join a class"], ["/library", "Library"]],
  teacher: [["/", "This week"], ["/dashboard", "Dashboard"], ["/library", "Library"]],
  admin: [["/", "This week"], ["/dashboard", "Monitoring"], ["/admin/classes", "Classes"], ["/admin/people", "People"], ["/admin/curriculum", "Curriculum"], ["/admin/export", "Export"], ["/library", "Library"]],
};

export function shell(me, path, body) {
  const links = NAV[me.role] || NAV.student;
  const active = (href) => (href === "/" ? path === "/" : path.startsWith(href));
  return html`
    <a class="skip" href="#main" @click=${(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
    <header class="top">
      <a class="brand" href="#/"><span class="brand__light">STJBS</span> <b>Coding</b></a>
      <nav aria-label="Main">
        ${links.map(([href, label]) => html`<a href="#${href}" class=${active(href) ? "is-active" : ""} aria-current=${active(href) ? "page" : "false"}>${label}</a>`)}
        <a href="#/settings" class=${active("/settings") ? "is-active" : ""}>Settings</a>
      </nav>
    </header>
    <main id="main" tabindex="-1">${body}</main>`;
}

export const loading = (what = "Loading") => html`<p class="muted" role="status">${what}...</p>`;

export const problem = (msg, help = "") => html`
  <div class="notice notice--bad" role="alert"><span class="jy-badge jy-badge--bad">Problem</span> <span>${msg}</span>${help ? html` <span class="muted">${help}</span>` : nothing}</div>`;

export const notice = (msg, kind = "warn") => html`
  <div class="notice" role="status"><span class="jy-badge jy-badge--${kind}">${kind === "ok" ? "OK" : kind === "bad" ? "Problem" : "Note"}</span> <span>${msg}</span></div>`;

export const empty = (msg) => html`<p class="muted empty">${msg}</p>`;

export const pageHead = (eyebrow, light, bold, extra = nothing) => html`
  <div class="page-head">
    <div>
      ${eyebrow ? html`<p class="jy-eyebrow">${eyebrow}</p>` : nothing}
      <h1 class="jy-pair title">${light} <b>${bold}</b></h1>
    </div>
    ${extra}
  </div>`;

// Project status = shape + word + colour, as the design system requires.
const STATUS = {
  in_progress: ["", "In progress"],
  done: ["ok", "Done"],
  needs_help: ["warn", "Needs help"],
  none: ["", "Not started"],
};
export const statusBadge = (s) => {
  const [kind, label] = STATUS[s] || STATUS.none;
  return html`<span class="jy-badge ${kind ? `jy-badge--${kind}` : ""}">${label}</span>`;
};

export const badge = (label, kind = "") => html`<span class="jy-badge ${kind ? `jy-badge--${kind}` : ""}">${label}</span>`;

// Tabs within a page (class pages). Links, so each tab has its own URL.
export const tabs = (base, items, activeKey) => html`
  <nav class="tabs" aria-label="Sections">
    ${items.map(([key, label, count]) => html`<a href="#${base}/${key}" class=${key === activeKey ? "is-active" : ""} aria-current=${key === activeKey ? "page" : "false"}>${label}${count ? html` <span class="count">${count}</span>` : nothing}</a>`)}
  </nav>`;

// Runs an async action from a button: disables it while busy and reports errors.
export async function busy(event, fn, onError) {
  const btn = event?.currentTarget;
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) {
    if (e?.code) console.error(e);   // Firebase errors; our own messages are for the user, not the console
    (onError || alert)(e?.code ? friendlyError(e) : e.message || String(e));
  }
  finally { if (btn && btn.isConnected) btn.disabled = false; }
}

export function download(filename, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Turns a Firebase error into one line a student or teacher can act on.
export function friendlyError(e) {
  const code = e?.code || "";
  if (code.includes("permission-denied")) return "You do not have access to this. If you think you should, ask your teacher.";
  if (code.includes("unavailable") || code.includes("network")) return "Cannot reach the server. Check your connection and try again.";
  return e?.message || "Something went wrong. Try again.";
}

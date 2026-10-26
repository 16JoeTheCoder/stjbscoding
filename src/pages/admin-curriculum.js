// Admin: upload, check, preview and publish curriculum versions; apply errata; roll back.
// The rules for what may change are in CURRICULUM_FORMAT.md and src/curriculum.js.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { validateCurriculum, frozenProblems, errataDiff, allSnippets, findLevel, sameJson } from "../curriculum.js";
import { runPython } from "../python/runner.js";
import { pageHead, busy, problem, notice, badge, empty } from "../ui.js";
import { dateOf } from "../time.js";

let flash = "";   // message shown after the page reloads itself

export default async function adminCurriculum(ctx) {
  const config = await data.getCurriculumConfig();
  const [versions, classes] = await Promise.all([data.listVersions(config.maxVersion), data.listAllClasses()]);
  const byVersion = Object.fromEntries(versions.map((v) => [v.version, v.data]));
  const pinsByClass = classes.map((c) => ({ className: c.name, pins: c.pins }));
  const frozen = new Set(classes.flatMap((c) => Object.keys(c.pins || {})));

  const s = {
    mode: "new",              // "new" or "errata"
    target: config.latest,    // version that errata apply to
    fileName: "", parsed: null, problems: [], changes: [],
    snippets: null,           // [{ where, ok, error }] after running
    running: false, notes: "", error: "", msg: flash,
  };
  flash = "";

  const check = () => {
    s.problems = []; s.changes = []; s.snippets = null;
    if (!s.parsed) return;
    s.problems = validateCurriculum(s.parsed);
    if (s.problems.length) return;
    if (s.mode === "new") {
      s.problems = frozenProblems(s.parsed, pinsByClass, byVersion);
    } else {
      const diff = errataDiff(byVersion[s.target], s.parsed);
      s.problems = diff.problems.map((p) => `Not an erratum: ${p}`);
      s.changes = diff.changes;
      if (!diff.problems.length && !diff.changes.length) s.problems = ["Nothing changed compared with version " + s.target + "."];
    }
  };

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    s.fileName = file.name; s.error = ""; s.msg = "";
    try { s.parsed = JSON.parse(await file.text()); } catch (err) {
      s.parsed = null; s.problems = [`This is not valid JSON: ${err.message}`]; return ctx.rerender();
    }
    check();
    ctx.rerender();
    if (!s.problems.length) runSnippets();
  };

  const runSnippets = async () => {
    const list = allSnippets(s.parsed);
    s.snippets = []; s.running = true; ctx.rerender();
    for (const sn of list) {
      const r = await runPython(sn.code, { stdin: sn.stdin || [] });
      s.snippets.push({ where: sn.where, ok: !r.error, error: r.error });
      ctx.rerender();
    }
    s.running = false; ctx.rerender();
  };

  const failing = () => (s.snippets || []).filter((x) => !x.ok);
  const ready = () => s.parsed && !s.problems.length && s.snippets && !s.running;

  const publish = (e) => busy(e, async () => {
    if (failing().length && !confirm(`${failing().length} snippet(s) error. Publish anyway?`)) return;
    if (s.mode === "new") {
      const v = await data.publishVersion(s.parsed, s.notes.trim(), ctx.me, config.maxVersion);
      flash = `Version ${v} is published and is now the latest.`;
    } else {
      await data.applyErrata(s.target, s.parsed, s.notes.trim() || "Errata", ctx.me);
      flash = `Errata applied to version ${s.target}.`;
    }
    ctx.reload();
  }, (msg) => { s.error = msg; ctx.rerender(); });

  const makeLatest = (v) => (e) => busy(e, async () => {
    const problems = frozenProblems(byVersion[v], pinsByClass, byVersion, { allowMissing: true });
    if (problems.length) throw new Error(`Cannot make version ${v} the latest: ${problems.join(" ")}`);
    await data.setLatest(v, config.maxVersion);
    flash = `Version ${v} is now the latest.`;
    ctx.reload();
  }, (msg) => { s.error = msg; ctx.rerender(); });

  return () => html`
    ${pageHead("Admin", "", "Curriculum")}
    ${s.error ? problem(s.error) : nothing}
    ${s.msg ? notice(s.msg, "ok") : nothing}
    <p class="prose mb-5">Latest version: <b>${config.latest || "none"}</b>.
      Levels any class has reached are frozen: ${frozen.size ? [...frozen].join(", ") : "none yet"}. A new version may add levels and change levels nobody has reached; it may not change a frozen level. Typos and broken slide links go in as errata. Format: CURRICULUM_FORMAT.md.</p>

    <div class="jy-panel">
      <h3>Upload</h3>
      <div class="form mt-4">
        <div class="choice" role="radiogroup" aria-label="Upload type">
          <label><input type="radio" name="mode" .checked=${s.mode === "new"} @change=${() => { s.mode = "new"; check(); ctx.rerender(); }} /><span>New version</span></label>
          <label><input type="radio" name="mode" .checked=${s.mode === "errata"} ?disabled=${!versions.length} @change=${() => { s.mode = "errata"; check(); ctx.rerender(); }} /><span>Errata to an existing version</span></label>
        </div>
        ${s.mode === "errata" ? html`<label class="jy-field"><span class="jy-field__label">Version to correct</span>
          <select class="jy-field__input" @change=${(e) => { s.target = Number(e.target.value); check(); ctx.rerender(); }}>
            ${versions.map((v) => html`<option value=${v.version} ?selected=${v.version === s.target}>Version ${v.version}</option>`)}</select></label>` : nothing}
        <label class="jy-field"><span class="jy-field__label">Curriculum file (.json)</span>
          <input class="jy-field__input file-input" type="file" accept=".json,application/json" @change=${onFile} /></label>
      </div>
    </div>

    ${s.parsed || s.problems.length ? html`
      <h2 class="section">Check ${s.fileName ? html`<span class="muted small">${s.fileName}</span>` : nothing}</h2>
      ${s.problems.length ? html`
        <div class="notice notice--bad" role="alert"><span class="jy-badge jy-badge--bad">Rejected</span> <span>${s.problems.length} problem(s). Nothing was published.</span></div>
        <ul class="list">${s.problems.map((p) => html`<li class="small">${p}</li>`)}</ul>`
      : html`
        ${notice(s.mode === "new" ? "The file is valid and leaves frozen levels unchanged." : `${s.changes.length} text change(s); nothing else changed.`, "ok")}
        ${s.mode === "errata" ? html`<ul class="list">${s.changes.map((c) => html`<li class="small mono">${c}</li>`)}</ul>` : preview(s.parsed, byVersion[config.latest], frozen)}

        <h2 class="section">Snippets</h2>
        ${!s.snippets ? html`<button class="jy-btn jy-btn--ghost" @click=${runSnippets}>Run all snippets</button>` : html`
          <p class="muted" role="status">${s.running ? `Running ${s.snippets.length + 1}...` : `${s.snippets.length} run, ${failing().length} with errors.`}</p>
          <div class="table-wrap"><table class="jy-table">
            <thead><tr><th>Snippet</th><th>Result</th></tr></thead>
            <tbody>${s.snippets.map((x) => html`<tr><td class="mono">${x.where}</td>
              <td class="wrap">${x.ok ? badge("Runs", "ok") : html`${badge("Error", "bad")}<pre class="block output__error mt-2">${x.error}</pre>`}</td></tr>`)}</tbody>
          </table></div>`}

        <div class="form mt-6">
          <label class="jy-field"><span class="jy-field__label">${s.mode === "new" ? "Notes for this version" : "What was corrected"}</span>
            <input class="jy-field__input" maxlength="300" .value=${s.notes} @input=${(e) => { s.notes = e.target.value; }} /></label>
          <div><button class="jy-btn jy-btn--accent" ?disabled=${!ready()} @click=${publish}>${s.mode === "new" ? `Publish as version ${config.maxVersion + 1}` : `Apply errata to version ${s.target}`}</button></div>
        </div>`}` : nothing}

    <h2 class="section">Versions</h2>
    ${versions.length === 0 ? empty("Nothing published yet. Upload curriculum/curriculum.json from the repository to start.") : html`
      <div class="table-wrap"><table class="jy-table">
        <thead><tr><th class="num">Version</th><th>Published</th><th>Notes</th><th>Errata</th><th></th></tr></thead>
        <tbody>${versions.map((v) => html`<tr>
          <td class="num">${v.version}</td><td>${dateOf(v.publishedAt)} ${v.publishedBy}</td><td class="wrap">${v.notes}</td>
          <td class="num">${(v.errata || []).length}</td>
          <td>${v.version === config.latest ? badge("Latest", "ok") : html`<button class="jy-btn jy-btn--ghost" @click=${makeLatest(v.version)}>Make latest</button>`}</td></tr>`)}</tbody>
      </table></div>`}`;
}

// What a new version changes compared with the current latest, level by level.
function preview(next, latest, frozen) {
  return html`${next.tracks.map((t) => html`
    <h3 class="sub">${t.title}</h3>
    <ul class="list">${t.levels.map((l) => {
      const before = latest ? findLevel(latest, l.id) : null;
      const state = !before ? badge("New", "ok") : sameJson(before, l) ? badge("Unchanged") : badge("Changed", "warn");
      return html`<li><div class="row">${state} ${frozen.has(l.id) ? badge("Frozen") : nothing} <b>${l.title}</b> <span class="muted small">${l.topics.length} topics</span></div>
        <p class="muted small mt-1">${l.topics.map((tp) => tp.title).join(" · ")}</p></li>`;
    })}</ul>`)}`;
}

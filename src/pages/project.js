// A weekly project. Students pick an option, write code (Python) or paste a Scratch
// link, and set a status. Teachers open it with ?student=<uid> to see one student's work.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { pageHead, statusBadge, busy, notice, problem, empty } from "../ui.js";
import { codeBox, newCodeState } from "../editor.js";
import { dateOf, timeOf } from "../time.js";

const SCRATCH_RE = /^https:\/\/scratch\.mit\.edu\/projects\/[0-9]+\/?$/;
const LIMITS = { code: 50000, error: 4000, note: 1000 };   // same limits as firestore.rules
const STATUSES = [["in_progress", "In progress"], ["done", "Done"], ["needs_help", "Needs help"]];

export default async function projectPage(ctx) {
  const { id: cid, pid } = ctx.params;
  const [cls, project] = await Promise.all([data.getClass(cid), data.getProject(cid, pid)]);
  if (!cls || !project || project.deleted) throw new Error("This project does not exist.");
  if (ctx.me.role !== "student" && ctx.query.student) return studentWork(ctx, cls, project, ctx.query.student);
  if (ctx.me.role !== "student") return overview(ctx, cls, project);
  return work(ctx, cls, project);
}

const optionText = (o) => html`<b>${o.title}</b>${o.brief ? html`<span class="muted"> — ${o.brief}</span>` : nothing}`;

// ---------- Student ----------

async function work(ctx, cls, project) {
  const [sub, myHelp] = await Promise.all([
    data.getMySubmission(cls.id, project.id, ctx.me.id), data.listMyHelp(cls.id, ctx.me.id),
  ]);
  const python = cls.track === "python";
  const s = {
    optionId: sub?.optionId || (project.options.length === 1 ? project.options[0].id : ""),
    status: sub?.status || "in_progress",
    scratchUrl: sub?.scratchUrl || "",
    lastError: sub?.lastError || "",
    note: "",
    saved: sub ? `Saved ${dateOf(sub.updatedAt)} ${timeOf(sub.updatedAt)}` : "",
    error: "",
  };
  const starter = () => project.options.find((o) => o.id === s.optionId)?.starter || "";
  const code = newCodeState(sub?.code ?? starter());
  const openHelp = () => myHelp.find((h) => h.projectId === project.id && h.status === "open");

  const save = (e) => busy(e, async () => {
    s.error = "";
    s.saved = "";
    if (!s.optionId) throw new Error("Choose a project option first.");
    if (!python && s.scratchUrl && !SCRATCH_RE.test(s.scratchUrl.trim())) {
      throw new Error("Paste the project's share link, like https://scratch.mit.edu/projects/123456789");
    }
    if (code.code.length > LIMITS.code) throw new Error(`Your code is longer than ${LIMITS.code} characters. Make it shorter to save.`);
    if (s.status === "needs_help") {
      // Look again, in case another tab already asked for help on this project.
      myHelp.splice(0, myHelp.length, ...(await data.listMyHelp(cls.id, ctx.me.id)));
    }
    const askForHelp = s.status === "needs_help" && !openHelp();
    await data.saveSubmission(cls.id, project, ctx.me, {
      optionId: s.optionId, code: python ? code.code : "", scratchUrl: s.scratchUrl.trim(),
      status: s.status,
      // Errors and notes are cut to the lengths the database accepts, so saving never fails on them.
      lastError: python ? s.lastError.slice(-LIMITS.error) : "", note: s.note.slice(0, LIMITS.note), askForHelp,
    });
    if (askForHelp) myHelp.push({ projectId: project.id, status: "open" });
    s.saved = askForHelp ? "Saved. Your teacher has your code and your last error." : `Saved ${timeOf()}`;
    ctx.rerender();
  }, (msg) => { s.error = msg; ctx.rerender(); });

  return () => html`
    ${pageHead(`${cls.name} · week of ${project.week}`, "", project.title)}
    ${s.error ? problem(s.error) : nothing}
    ${s.saved ? notice(s.saved, "ok") : nothing}

    <fieldset class="stack">
      <legend class="jy-field__label">${project.options.length > 1 ? "Choose one" : "Project"}</legend>
      ${project.options.map((o) => html`
        <label class="check"><input type="radio" name="option" .checked=${s.optionId === o.id}
          @change=${() => { const fresh = code.code === code.original; s.optionId = o.id; if (fresh) Object.assign(code, newCodeState(starter()), { id: code.id }); ctx.rerender(); }} />
          <span>${optionText(o)}</span></label>`)}
    </fieldset>

    ${python ? codeBox(code, ctx.rerender, { title: "project.py", onRun: (r) => { s.lastError = r.error; } })
      : html`
        <label class="jy-field narrow mt-5"><span class="jy-field__label">Scratch share link</span>
          <input class="jy-field__input" .value=${s.scratchUrl} placeholder="https://scratch.mit.edu/projects/123456789" @input=${(e) => { s.scratchUrl = e.target.value; }} />
          <span class="jy-field__help">In Scratch, press Share, then copy the address from the browser.</span></label>`}

    <h2 class="section">Status</h2>
    <div class="choice" role="radiogroup" aria-label="Status">
      ${STATUSES.map(([v, label]) => html`<label><input type="radio" name="status" .checked=${s.status === v} @change=${() => { s.status = v; ctx.rerender(); }} /><span>${label}</span></label>`)}
    </div>
    ${s.status === "needs_help" ? html`
      <div class="form mt-4">
        ${openHelp() ? html`<p class="muted">You already have a help request open for this project. Saving updates your code; your teacher sees the latest.</p>` : html`
          <p class="muted">Saving sends your teacher your code${python ? " and your last error" : " and link"}.</p>
          <label class="jy-field"><span class="jy-field__label">What are you stuck on? (optional)</span>
            <textarea class="jy-field__input" .value=${s.note} @input=${(e) => { s.note = e.target.value; }}></textarea></label>`}
        ${python && s.lastError ? html`<pre class="block output__error">${s.lastError}</pre>` : nothing}
      </div>` : nothing}
    <div class="row mt-5"><button class="jy-btn" @click=${save}>Save</button></div>`;
}

// ---------- Teacher / admin ----------

async function overview(ctx, cls, project) {
  const subs = await data.listSubmissions(cls.id, project.id);
  return () => html`
    ${pageHead(`${cls.name} · week of ${project.week}`, "", project.title)}
    <ul class="stack">${project.options.map((o) => html`<li>${optionText(o)}</li>`)}</ul>
    <h2 class="section">Submissions</h2>
    ${subs.length === 0 ? empty("No student has started yet.") : html`
      <div class="table-wrap"><table class="jy-table">
        <thead><tr><th>Student</th><th>Status</th><th>Updated</th><th></th></tr></thead>
        <tbody>${subs.sort((a, b) => a.name.localeCompare(b.name)).map((x) => html`
          <tr><td>${x.name}</td><td>${statusBadge(x.status)}</td><td class="mono">${dateOf(x.updatedAt)} ${timeOf(x.updatedAt)}</td>
          <td><a href="#/class/${cls.id}/project/${project.id}?student=${x.uid}">Open</a></td></tr>`)}</tbody>
      </table></div>`}`;
}

async function studentWork(ctx, cls, project, uid) {
  const sub = await data.getMySubmission(cls.id, project.id, uid);
  if (!sub) return () => html`${pageHead(project.title, "", "No work yet")}${empty("This student has not saved anything for this project.")}`;
  const option = project.options.find((o) => o.id === sub.optionId);
  const code = newCodeState(sub.code || "");
  return () => html`
    ${pageHead(project.title, "", sub.name)}
    <div class="row">${statusBadge(sub.status)} <span class="muted">Saved ${dateOf(sub.updatedAt)} ${timeOf(sub.updatedAt)}</span></div>
    ${option ? html`<p class="mt-4">${optionText(option)}</p>` : nothing}
    ${sub.scratchUrl ? html`<p class="mt-4"><a href=${sub.scratchUrl} target="_blank" rel="noopener">Open the Scratch project</a></p>` : nothing}
    ${sub.lastError ? html`<h2 class="section">Last error</h2><pre class="block output__error">${sub.lastError}</pre>` : nothing}
    ${cls.track === "python" ? html`<h2 class="section">Code</h2>
      <p class="muted">Edits here are only for trying things; they do not change the student's work.</p>
      ${codeBox(code, ctx.rerender, { title: `${sub.name}.py` })}` : nothing}`;
}

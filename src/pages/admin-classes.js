// Admin: create classes and edit their name, teachers, schedule and term dates.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { pageHead, busy, problem, notice, empty, badge } from "../ui.js";
import { DAY_NAMES, today, addDays } from "../time.js";

const blank = () => ({ name: "", track: "python", teacherIds: [], schedule: [{ weekday: 2, start: "15:00", minutes: 60 }], termStart: today(), termEnd: addDays(today(), 120), defaultPresent: true });

export default async function adminClasses(ctx) {
  const [classes, users] = await Promise.all([data.listAllClasses(), data.listUsers()]);
  const staff = users.filter((u) => u.role !== "student").sort((a, b) => a.name.localeCompare(b.name));
  const editing = ctx.params.id ? classes.find((c) => c.id === ctx.params.id) : null;
  const f = editing ? structuredClone({ ...blank(), ...editing }) : blank();
  const s = { error: "", msg: "" };

  const save = (e) => busy(e, async () => {
    if (!f.name.trim()) throw new Error("Give the class a name.");
    if (!f.schedule.length) throw new Error("Add at least one weekly session.");
    if (f.termEnd < f.termStart) throw new Error("The term ends before it starts.");
    const teacherNames = Object.fromEntries(f.teacherIds.map((id) => [id, users.find((u) => u.id === id)?.name || ""]));
    const fields = { name: f.name.trim(), track: f.track, teacherIds: f.teacherIds, teacherNames, schedule: f.schedule, termStart: f.termStart, termEnd: f.termEnd, defaultPresent: f.defaultPresent };
    if (editing) {
      await data.updateClass(editing.id, { ...fields, archived: !!f.archived });
      ctx.go("/admin/classes");
    } else {
      const id = await data.createClass(fields);
      ctx.go(`/class/${id}`);
    }
  }, (msg) => { s.error = msg; ctx.rerender(); });

  const form = () => html`
    <div class="form">
      <label class="jy-field"><span class="jy-field__label">Name</span>
        <input class="jy-field__input" maxlength="80" .value=${f.name} @input=${(e) => { f.name = e.target.value; }} placeholder="Python Sec 1 Tuesday" /></label>
      <label class="jy-field"><span class="jy-field__label">Track</span>
        <select class="jy-field__input" ?disabled=${!!editing} @change=${(e) => { f.track = e.target.value; }}>
          <option value="python" ?selected=${f.track === "python"}>Python (Secondary and JC)</option>
          <option value="scratch" ?selected=${f.track === "scratch"}>Scratch (Primary)</option>
        </select>${editing ? html`<span class="jy-field__help">The track cannot change once a class exists.</span>` : nothing}</label>
      <fieldset><legend class="jy-field__label">Teachers</legend>
        ${staff.length === 0 ? html`<p class="muted">Nobody has the teacher role yet. Promote student teachers in People first.</p>` : nothing}
        ${staff.map((u) => html`<label class="check mr-4"><input type="checkbox" .checked=${f.teacherIds.includes(u.id)}
          @change=${(e) => { f.teacherIds = e.target.checked ? [...f.teacherIds, u.id] : f.teacherIds.filter((x) => x !== u.id); }} /> ${u.name} <span class="muted small">${u.role}</span></label>`)}
      </fieldset>
      <fieldset><legend class="jy-field__label">Weekly sessions (Asia/Jakarta time)</legend>
        ${f.schedule.map((slot, i) => html`<div class="row mb-2">
          <select class="jy-field__input w-auto" aria-label="Day" @change=${(e) => { slot.weekday = Number(e.target.value); }}>
            ${[1, 2, 3, 4, 5, 6].map((d) => html`<option value=${d} ?selected=${slot.weekday === d}>${DAY_NAMES[d]}</option>`)}</select>
          <input class="jy-field__input w-auto" type="time" aria-label="Start" .value=${slot.start} @change=${(e) => { slot.start = e.target.value; }} />
          <input class="jy-field__input w-num" type="number" min="15" max="240" step="5" aria-label="Minutes" .value=${String(slot.minutes)} @change=${(e) => { slot.minutes = Number(e.target.value); }} /> <span class="muted">min</span>
          <button class="jy-btn jy-btn--ghost jy-btn--s" @click=${() => { f.schedule.splice(i, 1); ctx.rerender(); }}>Remove</button></div>`)}
        <button class="jy-btn jy-btn--ghost jy-btn--s" @click=${() => { f.schedule.push({ weekday: 4, start: "15:00", minutes: 60 }); ctx.rerender(); }}>Add a session</button>
      </fieldset>
      <div class="row">
        <label class="jy-field"><span class="jy-field__label">Term starts</span><input class="jy-field__input" type="date" .value=${f.termStart} @change=${(e) => { f.termStart = e.target.value; }} /></label>
        <label class="jy-field"><span class="jy-field__label">Term ends</span><input class="jy-field__input" type="date" .value=${f.termEnd} @change=${(e) => { f.termEnd = e.target.value; }} /></label>
      </div>
      ${editing ? html`<label class="check"><input type="checkbox" .checked=${!!f.archived} @change=${(e) => { f.archived = e.target.checked; }} /> Archived (hidden from This week and monitoring)</label>` : nothing}
      <div class="row"><button class="jy-btn" @click=${save}>${editing ? "Save class" : "Create class"}</button>
        ${editing ? html`<a class="jy-btn jy-btn--ghost" href="#/admin/classes">Cancel</a>` : nothing}</div>
    </div>`;

  return () => html`
    ${pageHead("Admin", editing ? "Edit" : "", editing ? editing.name : "Classes")}
    ${s.error ? problem(s.error) : nothing}
    ${editing ? form() : html`
      ${classes.length === 0 ? empty("No classes yet.") : html`
        <div class="table-wrap"><table class="jy-table">
          <thead><tr><th>Class</th><th>Track</th><th>Teachers</th><th>Join code</th><th></th></tr></thead>
          <tbody>${classes.sort((a, b) => a.name.localeCompare(b.name)).map((c) => html`<tr>
            <td><a href="#/class/${c.id}">${c.name}</a> ${c.archived ? badge("Archived") : nothing}</td><td>${c.track}</td>
            <td>${Object.values(c.teacherNames || {}).join(", ")}</td><td class="mono">${c.joinCode}</td>
            <td><a href="#/admin/classes/${c.id}">Edit</a></td></tr>`)}</tbody></table></div>`}
      <details class="jy-panel mt-6" ?open=${classes.length === 0}><summary>New class</summary><div class="mt-4">${form()}</div></details>`}`;
}

// One class. Students see their view; the class's teachers get tabs to run it;
// admins see the teacher tabs read-only (they can look, not change).
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { classForStaff, classCurriculum } from "../load.js";
import { pageHead, tabs, empty, statusBadge, badge, busy, notice, problem } from "../ui.js";
import { formatDate, sessionsThisWeek, slotFor, ago, DAY_NAMES, mondayOf, today, toMillis, dateOf, timeOf } from "../time.js";
import { paceTable } from "./pace.js";

export default async function classPage(ctx) {
  const cls = await data.getClass(ctx.params.id);
  if (!cls) throw new Error("This class does not exist, or you are not in it.");
  const teaches = cls.teacherIds.includes(ctx.me.id) && ctx.me.role !== "student";
  if (!teaches && ctx.me.role === "student") return studentClass(ctx, cls);
  return staffClass(ctx, cls, teaches);
}

const trackName = (cls) => (cls.track === "python" ? "Python" : "Scratch");
const schedule = (cls) => cls.schedule.map((s) => `${DAY_NAMES[s.weekday]} ${s.start} (${s.minutes} min)`).join(", ");

// ---------------- Student ----------------

async function studentClass(ctx, cls) {
  const [projects, subs, cur, help] = await Promise.all([
    data.listProjects(cls.id), data.listMySubmissions(cls.id, ctx.me.id), classCurriculum(cls), data.listMyHelp(cls.id, ctx.me.id),
  ]);
  const thisWeek = sessionsThisWeek(cls);
  return () => html`
    ${pageHead(trackName(cls), "", cls.name)}
    <div class="grid">
      <div class="jy-panel"><h3>Schedule</h3><p>${schedule(cls)}</p>
        <p>This week: ${thisWeek.length ? thisWeek.map(formatDate).join(", ") : "no session"}</p></div>
      <div class="jy-panel"><h3>Now</h3>
        ${cur.current ? html`<p>We are on <a href="#/topic/${cur.current.topic.id}?class=${cls.id}">${cur.current.topic.title}</a>, topic ${cur.at + 1} of ${cur.topics.length}.</p>
          <div class="row"><div class="progress grow"><i style="width:${Math.round(((cur.at + 1) / cur.topics.length) * 100)}%"></i></div></div>`
        : html`<p>Your teacher has not started a topic yet.</p>`}
      </div>
    </div>

    <h2 class="section">Weekly projects</h2>
    ${projects.length === 0 ? empty("No projects yet.") : html`
      <div class="table-wrap"><table class="jy-table">
        <thead><tr><th>Week</th><th>Project</th><th>Status</th></tr></thead>
        <tbody>${projects.map((p) => html`
          <tr><td class="mono">${p.week}</td><td><a href="#/class/${cls.id}/project/${p.id}">${p.title}</a></td>
          <td>${statusBadge(subs.find((s) => s.projectId === p.id)?.status)}</td></tr>`)}</tbody>
      </table></div>`}

    ${help.length ? html`
      <h2 class="section">My help requests</h2>
      <ul class="list">${help.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)).map((h) => html`
        <li><div class="row">${badge(h.status === "open" ? "Waiting" : h.status === "answered" ? "Answered" : "Closed", h.status === "open" ? "warn" : "ok")} <b>${h.projectTitle}</b> <span class="muted small">${dateOf(h.createdAt)}</span></div>
        ${h.answer ? html`<p class="prose mt-2">${h.answeredByName}: ${h.answer}</p>` : nothing}
        ${h.status === "open" ? html`<div class="row mt-2"><button class="jy-btn jy-btn--ghost" @click=${(e) => busy(e, async () => { await data.closeHelp(cls.id, h.id); h.status = "closed"; ctx.rerender(); })}>I solved it</button></div>` : nothing}
        </li>`)}</ul>` : nothing}

    <h2 class="section">Curriculum</h2>
    ${levelList(cur, cls)}`;
}

function levelList(cur, cls) {
  if (!cur.levels.length) return empty("No curriculum has been published yet.");
  return cur.levels.map(({ level, version, pinned }) => html`
    <details ?open=${cur.current?.level.id === level.id}>
      <summary>${level.title} <span class="muted small ml-2">${pinned ? `version ${version}` : ""}</span></summary>
      <ul class="list">${level.topics.map((t) => html`
        <li><a href="#/topic/${t.id}?class=${cls.id}">${t.title}</a> ${cls.pointer?.topicId === t.id ? badge("Current") : nothing}
          ${t.overview ? html`<p class="muted small">${t.overview}</p>` : nothing}</li>`)}</ul>
    </details>`);
}

// ---------------- Teacher / admin ----------------

const TABS = [["overview", "Overview"], ["roster", "Roster"], ["curriculum", "Curriculum"], ["projects", "Projects"], ["help", "Help queue"], ["attendance", "Attendance"], ["pace", "Pace"]];

async function staffClass(ctx, cls, teaches) {
  const tab = ctx.params.tab || "overview";
  const l = await classForStaff(cls);
  const cur = await classCurriculum(cls);
  const extra = {};
  if (tab === "pace") extra.pace = await data.listPace(cls, l.sessions);
  if (tab === "projects") {
    extra.subs = await data.listSubmissions(cls.id);
  }
  const state = { error: "", msg: "" };
  const page = { ctx, cls, l, cur, extra, teaches, state };
  const base = `/class/${cls.id}`;
  const counts = { roster: l.pending.length, help: l.help.length, attendance: l.missing.length };

  const views = { overview, roster, curriculum, projects, help, attendance, pace: () => paceTable(extra.pace) };
  return () => html`
    ${pageHead(`${trackName(cls)}${teaches ? "" : " · read only"}`, "", cls.name)}
    ${tabs(base, TABS.map(([k, label]) => [k, label, counts[k]]), tab)}
    ${state.error ? problem(state.error) : nothing}
    ${state.msg ? notice(state.msg, "ok") : nothing}
    ${(views[tab] || overview)(page)}`;
}

// Runs a teacher action, then reloads the page so every number is fresh.
const act = (page, fn) => (e) => busy(e, async () => { await fn(); page.ctx.reload(); },
  (msg) => { page.state.error = msg; page.ctx.rerender(); });

function overview(page) {
  const { cls, l, cur, teaches } = page;
  const week = mondayOf(today());
  const proj = l.projects.find((p) => p.week === week);
  return html`
    <div class="grid">
      <div class="jy-panel"><h3>Now</h3>
        <p>${l.approved.length} students, ${l.pending.length} asking to join.</p>
        <p>${l.help.length} waiting for help. ${l.missing.length} session(s) without attendance.</p>
        <p>${cur.current ? `Topic ${cur.at + 1} of ${cur.topics.length}: ${cur.current.topic.title}.` : "No current topic set."}</p></div>
      <div class="jy-panel"><h3>Schedule</h3><p>${schedule(cls)}</p><p>Term ${cls.termStart} to ${cls.termEnd}</p>
        <p>Teachers: ${Object.values(cls.teacherNames || {}).join(", ") || "none"}</p></div>
      <div class="jy-panel"><h3>Join code</h3>
        <p class="code-big">${cls.joinCode}</p>
        <p>Students enter this code on the Join page. You approve each one in Roster.</p>
        ${teaches ? html`<div class="row"><button class="jy-btn jy-btn--ghost" @click=${act(page, () => data.replaceJoinCode(cls))}>New code</button></div>` : nothing}
      </div>
      <div class="jy-panel"><h3>This week's project</h3>
        ${proj ? html`<p>${proj.title}</p>` : html`<p>None yet. ${teaches ? html`<a href="#/class/${cls.id}/projects">Post one</a>` : ""}</p>`}</div>
      <div class="jy-panel"><h3>Attendance default</h3>
        <p>Students start as <b>${cls.defaultPresent ? "present" : "absent"}</b>; you mark the exceptions.</p>
        ${teaches ? html`<div class="row"><button class="jy-btn jy-btn--ghost" @click=${act(page, () => data.setDefaultPresent(cls.id, !cls.defaultPresent))}>Default to ${cls.defaultPresent ? "absent" : "present"}</button></div>` : nothing}
      </div>
    </div>`;
}

// ----- Roster -----

function roster(page) {
  const { cls, l, teaches, ctx } = page;
  const others = l.members.filter((m) => !["approved", "pending"].includes(m.status));
  const decide = (m, status) => act(page, () => data.decideMember(cls.id, m.uid, status, ctx.me));
  return html`
    <h2 class="section">Asking to join</h2>
    ${l.pending.length === 0 ? empty("No requests.") : html`
      <ul class="list">${l.pending.map((m) => html`
        <li class="row"><span class="grow"><b>${m.name}</b> <span class="muted small">${m.email}</span></span>
          ${teaches ? html`<button class="jy-btn jy-btn--ghost" @click=${decide(m, "approved")}>Approve</button>
          <button class="jy-btn jy-btn--ghost" @click=${decide(m, "rejected")}>Reject</button>` : nothing}
        </li>`)}</ul>`}
    <h2 class="section">Students (${l.approved.length})</h2>
    ${l.approved.length === 0 ? empty("Nobody yet.") : html`
      <ul class="list">${l.approved.map((m) => html`
        <li class="row"><span class="grow"><b>${m.name}</b> <span class="muted small">${m.email}</span></span>
          ${teaches ? html`<button class="jy-btn jy-btn--ghost" @click=${(e) => confirm(`Remove ${m.name} from ${cls.name}? Their work is kept.`) && decide(m, "removed")(e)}>Remove</button>` : nothing}
        </li>`)}</ul>`}
    ${others.length ? html`<h2 class="section">Rejected or removed</h2>
      <ul class="list">${others.map((m) => html`<li><b>${m.name}</b> <span class="muted small">${m.status}</span>
        ${teaches ? html` <button class="jy-btn jy-btn--ghost" @click=${decide(m, "approved")}>Re-admit</button>` : nothing}</li>`)}</ul>` : nothing}`;
}

// ----- Curriculum pointer -----

function curriculum(page) {
  const { cls, cur, teaches, ctx } = page;
  if (!cur.levels.length) return empty("No curriculum has been published yet. An admin uploads it.");
  return html`
    <p class="prose">${cur.current ? html`The class is on <b>${cur.current.topic.title}</b>, topic ${cur.at + 1} of ${cur.topics.length}.` : "No current topic set."}
      ${teaches ? " Choose \"We are here\" on the topic you are teaching. The first time the class reaches a level, that level is locked to the current curriculum version for this class." : ""}</p>
    <div class="row my-4"><div class="progress grow narrow"><i style="width:${cur.topics.length ? Math.round(((cur.at + 1) / cur.topics.length) * 100) : 0}%"></i></div></div>
    ${cur.levels.map(({ level, version, pinned }) => html`
      <h3 class="mt-5">${level.title} <span class="muted small">${pinned ? `locked to version ${version}` : `follows latest (version ${version})`}</span></h3>
      <ul class="list">${level.topics.map((t) => html`
        <li class="row"><span class="grow"><a href="#/topic/${t.id}?class=${cls.id}">${t.title}</a></span>
          ${cls.pointer?.topicId === t.id ? badge("We are here", "ok")
            : teaches ? html`<button class="jy-btn jy-btn--ghost" @click=${act(page, () => data.setPointer(cls, level.id, t.id, cur.latest))}>We are here</button>` : nothing}
        </li>`)}</ul>`)}`;
}

// ----- Weekly projects -----

function projects(page) {
  const { cls, l, cur, extra, teaches } = page;
  const form = (page.form ??= { title: "", week: mondayOf(today()), topicId: cur.current?.topic.id || "", custom: "" });
  const topic = cur.topics.find((t) => t.topic.id === form.topicId)?.topic;
  const options = topic?.projects?.length ? topic.projects : null;
  const statusCount = (pid, st) => extra.subs.filter((s) => s.projectId === pid && s.status === st).length;

  const create = act(page, async () => {
    const opts = options
      ? options.map((o) => ({ id: o.id, title: o.title, brief: o.brief || "", starter: o.starter || "" }))
      : [{ id: "custom", title: form.title, brief: form.custom, starter: "" }];
    if (!form.title.trim()) throw new Error("Give the project a title.");
    await data.createProject(cls.id, page.ctx.me, { title: form.title.trim(), week: form.week, topicId: form.topicId, options: opts });
  });

  return html`
    ${teaches ? html`
      <details class="jy-panel" ?open=${l.projects.length === 0}>
        <summary>Post a weekly project</summary>
        <div class="form mt-4">
          <label class="jy-field"><span class="jy-field__label">Title</span>
            <input class="jy-field__input" .value=${form.title} @input=${(e) => { form.title = e.target.value; }} placeholder="Week 3: loops" /></label>
          <label class="jy-field"><span class="jy-field__label">Week starting (Monday)</span>
            <input class="jy-field__input" type="date" .value=${form.week} @change=${(e) => { form.week = mondayOf(e.target.value); page.ctx.rerender(); }} /></label>
          <label class="jy-field"><span class="jy-field__label">Topic</span>
            <select class="jy-field__input" @change=${(e) => { form.topicId = e.target.value; page.ctx.rerender(); }}>
              <option value="">Choose a topic</option>
              ${cur.topics.map(({ topic: t, level }) => html`<option value=${t.id} ?selected=${t.id === form.topicId}>${level.title}: ${t.title}</option>`)}
            </select></label>
          ${options ? html`<div><p class="jy-field__label">Students choose from</p><ul>${options.map((o) => html`<li>${o.title}${o.brief ? html` <span class="muted">— ${o.brief}</span>` : ""}</li>`)}</ul></div>`
            : html`<label class="jy-field"><span class="jy-field__label">Brief (this topic has no project options in the curriculum)</span>
              <textarea class="jy-field__input" .value=${form.custom} @input=${(e) => { form.custom = e.target.value; }}></textarea></label>`}
          <div><button class="jy-btn" @click=${create}>Post project</button></div>
        </div>
      </details>` : nothing}

    <h2 class="section">Projects</h2>
    ${l.projects.length === 0 ? empty("No projects yet.") : html`
      <div class="table-wrap"><table class="jy-table">
        <thead><tr><th>Week</th><th>Project</th><th class="num">Done</th><th class="num">In progress</th><th class="num">Needs help</th><th class="num">Not started</th>${teaches ? html`<th></th>` : nothing}</tr></thead>
        <tbody>${l.projects.map((p) => {
          const started = extra.subs.filter((s) => s.projectId === p.id).length;
          return html`<tr><td class="mono">${p.week}</td><td><a href="#/class/${cls.id}/project/${p.id}">${p.title}</a></td>
            <td class="num">${statusCount(p.id, "done")}</td><td class="num">${statusCount(p.id, "in_progress")}</td>
            <td class="num">${statusCount(p.id, "needs_help")}</td><td class="num">${Math.max(0, l.approved.length - started)}</td>
            ${teaches ? html`<td><button class="jy-btn jy-btn--ghost" @click=${(e) => confirm(`Remove "${p.title}"? Student work is kept.`) && act(page, () => data.removeProject(cls.id, p.id))(e)}>Remove</button></td>` : nothing}</tr>`;
        })}</tbody>
      </table></div>`}`;
}

// ----- Help queue -----

function help(page) {
  const { cls, l, teaches, ctx } = page;
  const drafts = (page.drafts ??= {});
  if (l.help.length === 0) return empty("Nobody is waiting for help.");
  return html`
    <p class="muted mb-4">Longest waiting first. <button class="jy-btn jy-btn--ghost" @click=${() => ctx.reload()}>Refresh</button></p>
    <ul class="list">${l.help.map((h) => html`
      <li class="stack">
        <div class="row">${badge(`Waiting ${ago(h.createdAt)}`, "warn")} <b>${h.name}</b> <span class="muted">${h.projectTitle}</span>
          <a class="small" href="#/class/${cls.id}/project/${h.projectId}?student=${h.uid}">Open their work</a></div>
        ${h.note ? html`<p class="prose">"${h.note}"</p>` : nothing}
        ${h.error ? html`<pre class="block output__error">${h.error}</pre>` : nothing}
        ${h.scratchUrl ? html`<p><a href=${h.scratchUrl} target="_blank" rel="noopener">Scratch project</a></p>` : nothing}
        ${h.code ? html`<details><summary>Code</summary><pre class="block">${h.code}</pre></details>` : nothing}
        ${teaches ? html`
          <label class="jy-field narrow"><span class="jy-field__label">Answer</span>
            <textarea class="jy-field__input" .value=${drafts[h.id] || ""} @input=${(e) => { drafts[h.id] = e.target.value; }}></textarea></label>
          <div><button class="jy-btn jy-btn--ghost" @click=${act(page, async () => {
            const text = (drafts[h.id] || "").trim();
            if (!text) throw new Error("Write an answer first.");
            await data.answerHelp(cls.id, h.id, ctx.me, text);
          })}>Send answer</button></div>` : nothing}
      </li>`)}</ul>`;
}

// ----- Attendance -----

function attendance(page) {
  const { cls, l, teaches, ctx } = page;
  const byDate = Object.fromEntries(l.sessions.map((s) => [s.date, s]));
  const a = (page.att ??= { date: l.missing[0] || "", marks: null, history: null });

  // Editing a submitted session starts from exactly what was recorded, so students who have
  // since left keep their mark. A new record starts everyone at the class default, except
  // students approved after that date (they were not in the class yet; left blank).
  const joinedBy = (m, date) => !m.decidedAt || dateOf(m.decidedAt) <= date;
  const fill = (date) => {
    const s = byDate[date];
    const recorded = s?.status === "submitted" ? s.marks || {} : null;
    const marks = { ...(recorded || {}) };
    if (!recorded) for (const m of l.approved) if (joinedBy(m, date)) marks[m.uid] = cls.defaultPresent ? "present" : "absent";
    Object.assign(a, { date, marks, history: null });
  };
  const rows = () => l.members
    .filter((m) => m.status === "approved" || a.marks[m.uid])
    .sort((x, y) => x.name.localeCompare(y.name));
  const open = (date) => { fill(date); ctx.rerender(); };
  if (a.date && !a.marks) fill(a.date);

  const save = (status, deleted = false) => act(page, async () => {
    const prev = byDate[a.date];
    await data.saveSession(cls, a.date, ctx.me, { status, marks: status === "cancelled" ? {} : a.marks, deleted }, prev?.rev || 0);
    page.att = null;
  });

  const editor = () => {
    const s = byDate[a.date];
    const slot = cls.schedule.length ? slotFor(cls, a.date) : null;
    return html`
      <div class="jy-panel mt-5">
        <h3>${formatDate(a.date)}${slot ? ` ${slot.start}` : ""}</h3>
        <p>${s ? html`${s.deleted ? "Deleted" : s.status === "cancelled" ? "Marked as no session" : "Submitted"} (edit ${s.rev}).` : `Not submitted. Everyone starts as ${cls.defaultPresent ? "present" : "absent"}; change the exceptions, then submit.`}</p>
        ${rows().length === 0 ? empty("No students in this class.") : html`
          <ul class="list mt-4">${rows().map((m) => html`
            <li class="row"><span class="grow">${m.name}${m.status !== "approved" ? html` <span class="muted small">(no longer in the class)</span>` : nothing}${!a.marks[m.uid] ? html` <span class="muted small">(not recorded)</span>` : nothing}</span>
              <span class="choice" role="radiogroup" aria-label=${`Attendance for ${m.name}`}>
                ${["present", "absent"].map((v) => html`<label><input type="radio" name=${"att-" + m.uid} .checked=${a.marks[m.uid] === v} ?disabled=${!teaches}
                  @change=${() => { a.marks[m.uid] = v; ctx.rerender(); }} /><span>${v === "present" ? "Present" : "Absent"}</span></label>`)}
              </span></li>`)}</ul>`}
        ${teaches ? html`
          <div class="row">
            <button class="jy-btn jy-btn--accent" @click=${save("submitted")}>${s ? "Save changes" : "Submit attendance"}</button>
            <button class="jy-btn jy-btn--ghost" @click=${save("cancelled")}>No session this day</button>
            ${s && !s.deleted ? html`<button class="jy-btn jy-btn--ghost" @click=${(e) => confirm("Delete this attendance record? It stays in the history and can be submitted again.") && save(s.status, true)(e)}>Delete</button>` : nothing}
            ${s ? html`<button class="jy-btn jy-btn--ghost" @click=${(e) => busy(e, async () => { a.history = await data.listSessionHistory(cls.id, a.date); ctx.rerender(); })}>Show history</button>` : nothing}
          </div>` : nothing}
        ${a.history ? html`<h3 class="mt-5">History</h3><ul class="list">${a.history.sort((x, y) => x.rev - y.rev).map((h) => html`
          <li><b>Edit ${h.rev}</b> by ${h.byName}, ${dateOf(h.at)} ${timeOf(h.at)}: ${h.deleted ? "deleted" : h.status},
            ${Object.values(h.marks || {}).filter((v) => v === "absent").length} absent</li>`)}</ul>` : nothing}
      </div>`;
  };

  const past = [...new Set([...l.missing, ...l.sessions.map((s) => s.date)])].sort().reverse();
  return html`
    ${l.missing.length ? notice(`${l.missing.length} session(s) need attendance. Unsubmitted sessions are flagged to the admin.`) : nothing}
    <div class="table-wrap"><table class="jy-table">
      <thead><tr><th>Date</th><th>Status</th><th class="num">Absent</th><th></th></tr></thead>
      <tbody>${past.map((d) => {
        const s = byDate[d];
        const st = !s || s.deleted ? badge("Not submitted", "bad") : s.status === "cancelled" ? badge("No session") : badge("Submitted", "ok");
        return html`<tr><td>${formatDate(d)}</td><td>${st}</td>
          <td class="num">${s && !s.deleted ? Object.values(s.marks || {}).filter((v) => v === "absent").length : ""}</td>
          <td><button class="jy-btn jy-btn--ghost" @click=${() => open(d)}>${teaches && (!s || s.deleted) ? "Take attendance" : "Open"}</button></td></tr>`;
      })}</tbody>
    </table></div>
    ${past.length === 0 ? empty("No sessions have happened yet this term.") : nothing}
    ${a.date && a.marks ? editor() : nothing}`;
}

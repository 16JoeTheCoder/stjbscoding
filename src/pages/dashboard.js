// Dashboards: a fuller picture than "This week". Student: all my work.
// Teacher: every student against every project. Admin: read-only monitoring of all classes.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { classForStaff, classCurriculum } from "../load.js";
import { pageHead, empty, statusBadge, badge } from "../ui.js";
import { formatDate, ago, daysBetween, dateOf, today } from "../time.js";
import { HELP_STALE_DAYS } from "../config.js";
import { paceTable } from "./pace.js";

export default async function dashboard(ctx) {
  if (ctx.me.role === "student") return student(ctx);
  if (ctx.me.role === "admin") return admin(ctx);
  return teacher(ctx);
}

async function student(ctx) {
  const memberships = (await data.listMyMemberships(ctx.me)).filter((m) => m.cls);
  const rows = await Promise.all(memberships.map(async ({ cls }) => ({
    cls,
    projects: await data.listProjects(cls.id),
    subs: await data.listMySubmissions(cls.id, ctx.me.id),
    help: await data.listMyHelp(cls.id, ctx.me.id),
  })));
  return () => html`
    ${pageHead("Dashboard", "My", "work")}
    ${rows.length === 0 ? empty("You are not in a class yet.") : nothing}
    ${rows.map(({ cls, projects, subs, help }) => {
      const done = subs.filter((s) => s.status === "done").length;
      return html`
        <h2 class="section"><a href="#/class/${cls.id}">${cls.name}</a></h2>
        <p class="muted mb-4">${done} of ${projects.length} projects done. ${help.length} help request(s) asked.</p>
        ${projects.length ? html`<div class="table-wrap"><table class="jy-table">
          <thead><tr><th>Week</th><th>Project</th><th>Status</th></tr></thead>
          <tbody>${projects.map((p) => html`<tr><td class="mono">${p.week}</td>
            <td><a href="#/class/${cls.id}/project/${p.id}">${p.title}</a></td>
            <td>${statusBadge(subs.find((s) => s.projectId === p.id)?.status)}</td></tr>`)}</tbody></table></div>` : empty("No projects yet.")}`;
    })}`;
}

async function teacher(ctx) {
  const classes = (await data.listMyTeaching(ctx.me.id)).filter((c) => !c.archived);
  const rows = await Promise.all(classes.map(async (cls) => {
    const l = await classForStaff(cls);
    const [subs, pace, cur] = await Promise.all([data.listSubmissions(cls.id), data.listPace(cls, l.sessions), classCurriculum(cls)]);
    return { ...l, subs, pace, cur };
  }));
  return () => html`
    ${pageHead("Dashboard", "My", "classes")}
    ${rows.length === 0 ? empty("You do not teach any classes yet.") : nothing}
    ${rows.map((r) => html`
      <h2 class="section"><a href="#/class/${r.cls.id}">${r.cls.name}</a></h2>
      <p class="muted mb-4">${r.cur.current ? `On ${r.cur.current.topic.title}, topic ${r.cur.at + 1} of ${r.cur.topics.length}.` : "No current topic."}
        ${r.missing.length ? ` ${r.missing.length} session(s) need attendance.` : ""} ${r.help.length ? ` ${r.help.length} waiting for help.` : ""}</p>
      ${matrix(r)}
      <h3 class="sub">Pace</h3>
      ${paceTable(r.pace)}`)}`;
}

// Students down, projects across, latest project first.
function matrix({ cls, approved, projects, subs }) {
  if (!approved.length || !projects.length) return empty("No students or no projects yet.");
  const shown = projects.slice(0, 6);
  const status = (uid, pid) => subs.find((s) => s.uid === uid && s.projectId === pid)?.status;
  return html`
    <div class="table-wrap"><table class="jy-table">
      <thead><tr><th>Student</th>${shown.map((p) => html`<th><a href="#/class/${cls.id}/project/${p.id}">${p.week}</a></th>`)}</tr></thead>
      <tbody>${approved.map((m) => html`<tr><td>${m.name}</td>${shown.map((p) => html`<td>
        <a class="plain" href="#/class/${cls.id}/project/${p.id}?student=${m.uid}">${statusBadge(status(m.uid, p.id))}</a></td>`)}</tr>`)}</tbody>
    </table></div>`;
}

// Read-only monitoring for faculty.
async function admin() {
  const classes = (await data.listAllClasses()).filter((c) => !c.archived);
  const rows = await Promise.all(classes.map(async (cls) => {
    const l = await classForStaff(cls);
    return { ...l, cur: await classCurriculum(cls), pace: await data.listPace(cls, l.sessions) };
  }));
  const missing = rows.flatMap((r) => r.missing.map((date) => ({ date, cls: r.cls })));
  const stale = rows.flatMap((r) => r.help.filter((h) => daysBetween(dateOf(h.createdAt), today()) >= HELP_STALE_DAYS).map((h) => ({ ...h, cls: r.cls })));
  return () => html`
    ${pageHead("Read only", "Program", "monitoring")}
    <div class="table-wrap"><table class="jy-table">
      <thead><tr><th>Class</th><th>Teachers</th><th class="num">Students</th><th>Current topic</th><th class="num">Attendance missing</th><th class="num">Help open</th><th class="num">Join requests</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr>
        <td><a href="#/class/${r.cls.id}">${r.cls.name}</a></td>
        <td>${Object.values(r.cls.teacherNames || {}).join(", ")}</td>
        <td class="num">${r.approved.length}</td>
        <td>${r.cur.current ? `${r.cur.at + 1}/${r.cur.topics.length} ${r.cur.current.topic.title}` : "Not set"}</td>
        <td class="num">${r.missing.length}</td><td class="num">${r.help.length}</td><td class="num">${r.pending.length}</td></tr>`)}</tbody>
    </table></div>
    ${rows.length === 0 ? empty("No classes yet. Create one in Classes.") : nothing}

    <h2 class="section">Attendance not submitted</h2>
    ${missing.length === 0 ? empty("Every session that has ended has attendance.") : html`
      <ul class="list">${missing.sort((a, b) => (a.date < b.date ? -1 : 1)).map((m) => html`
        <li class="row">${badge("Not submitted", "bad")} <a href="#/class/${m.cls.id}/attendance">${m.cls.name}</a> <span class="mono">${formatDate(m.date)}</span>
          <span class="muted">${Object.values(m.cls.teacherNames || {}).join(", ")}</span></li>`)}</ul>`}

    <h2 class="section">Help unanswered for ${HELP_STALE_DAYS}+ days</h2>
    ${stale.length === 0 ? empty("None.") : html`
      <ul class="list">${stale.map((h) => html`
        <li class="row">${badge(`Waiting ${ago(h.createdAt)}`, "bad")} <b>${h.name}</b> <span>${h.projectTitle}</span>
          <a href="#/class/${h.cls.id}/help">${h.cls.name}</a></li>`)}</ul>`}

    <h2 class="section">Pace</h2>
    ${rows.map((r) => html`<h3 class="sub">${r.cls.name}</h3>${paceTable(r.pace)}`)}`;
}

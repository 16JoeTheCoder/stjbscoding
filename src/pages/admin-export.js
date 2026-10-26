// Admin: download everything as CSV or JSON. This is the backup system, so the
// app warns when the last export is old (EXPORT_WARN_DAYS in config.js).
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { pageHead, busy, notice, problem, download } from "../ui.js";
import { dateOf, timeOf, toMillis, daysBetween, today } from "../time.js";
import { EXPORT_WARN_DAYS } from "../config.js";
import { toCsv } from "../csv.js";

// Reads every class and its records. Runs only when the admin presses a button.
async function collect() {
  const classes = await data.listAllClasses();
  const out = { exportedAt: new Date().toISOString(), classes: [], attendance: [], submissions: [], help: [], pace: [] };
  for (const c of classes) {
    const [members, sessions, subs, help, projects] = await Promise.all([
      data.listMembers(c.id), data.listSessions(c.id), data.listSubmissions(c.id), data.listAllHelp(c.id), data.listProjects(c.id),
    ]);
    const pace = await data.listPace(c, sessions);
    const name = Object.fromEntries(members.map((m) => [m.uid, m.name]));
    const projectTitle = Object.fromEntries(projects.map((p) => [p.id, p.title]));
    out.classes.push({ id: c.id, name: c.name, track: c.track, teachers: Object.values(c.teacherNames || {}).join("; "),
      termStart: c.termStart, termEnd: c.termEnd, members: members.map((m) => ({ uid: m.uid, name: m.name, email: m.email, status: m.status })) });
    for (const s of sessions) {
      if (s.status === "cancelled") {
        out.attendance.push({ class: c.name, date: s.date, session: s.deleted ? "deleted" : "no session", student: "", email: "", mark: "", edits: s.rev });
        continue;
      }
      for (const [uid, mark] of Object.entries(s.marks || {})) {
        out.attendance.push({ class: c.name, date: s.date, session: s.deleted ? "deleted" : "submitted", student: name[uid] || uid,
          email: members.find((m) => m.uid === uid)?.email || "", mark, edits: s.rev });
      }
    }
    for (const s of subs) {
      out.submissions.push({ class: c.name, project: projectTitle[s.projectId] || s.projectId, student: s.name, option: s.optionId,
        status: s.status, updated: stamp(s.updatedAt), scratchUrl: s.scratchUrl, code: s.code, lastError: s.lastError });
    }
    for (const h of help) {
      out.help.push({ class: c.name, student: h.name, project: h.projectTitle, status: h.status, asked: stamp(h.createdAt),
        answered: h.answeredAt ? stamp(h.answeredAt) : "", answeredBy: h.answeredByName || "",
        waitedDays: h.answeredAt ? daysBetween(dateOf(h.createdAt), dateOf(h.answeredAt)) : daysBetween(dateOf(h.createdAt), today()),
        note: h.note, answer: h.answer || "" });
    }
    for (const p of pace) out.pace.push({ class: c.name, date: p.id, tooEasy: p.easy, aboutRight: p.right, tooHard: p.hard, answers: p.n });
  }
  return out;
}

const stamp = (t) => (t ? `${dateOf(t)} ${timeOf(t)}` : "");

export default async function adminExport(ctx) {
  const info = await data.getExportInfo();
  const s = { info, error: "", msg: "" };
  const days = () => (s.info?.lastExportAt ? daysBetween(dateOf(s.info.lastExportAt), today()) : null);

  const run = (kind) => (e) => busy(e, async () => {
    const all = await collect();
    const day = today();
    if (kind === "json") download(`stjbs-coding-${day}.json`, JSON.stringify(all, null, 2), "application/json");
    else download(`stjbs-coding-${kind}-${day}.csv`, toCsv(all[kind]), "text/csv");
    // Only the full JSON counts as a backup; a single CSV does not reset the reminder.
    if (kind === "json") {
      await data.markExported(ctx.me);
      s.info = { lastExportAt: Date.now(), by: ctx.me.email };
    }
    s.msg = `Downloaded ${kind === "json" ? "everything as JSON" : kind}. Keep the file in the program's shared Drive folder.`;
    ctx.rerender();
  }, (msg) => { s.error = msg; ctx.rerender(); });

  return () => html`
    ${pageHead("Admin", "", "Export")}
    ${s.error ? problem(s.error) : nothing}
    ${s.msg ? notice(s.msg, "ok") : nothing}
    ${days() === null ? notice("Data has never been exported.") : days() >= EXPORT_WARN_DAYS ? notice(`Last exported ${days()} days ago. Export now.`) : html`
      <p class="muted mb-5">Last exported ${days() === 0 ? "today" : `${days()} days ago`}${s.info.by ? ` by ${s.info.by}` : ""} (${dateOf(toMillis(s.info.lastExportAt))}).</p>`}
    <p class="prose mb-5">Exports are the backup. Download everything at least every ${EXPORT_WARN_DAYS} days and keep it in the program's shared Drive folder. Pace totals are included only for sessions with enough answers to stay anonymous.</p>
    <div class="row">
      <button class="jy-btn" @click=${run("json")}>Download everything (JSON)</button>
      <button class="jy-btn jy-btn--ghost" @click=${run("attendance")}>Attendance (CSV)</button>
      <button class="jy-btn jy-btn--ghost" @click=${run("submissions")}>Submissions (CSV)</button>
      <button class="jy-btn jy-btn--ghost" @click=${run("help")}>Help requests (CSV)</button>
      <button class="jy-btn jy-btn--ghost" @click=${run("pace")}>Pace (CSV)</button>
    </div>`;
}

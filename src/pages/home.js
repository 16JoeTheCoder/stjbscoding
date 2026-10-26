// "This week": the first screen for every role. Shows only what needs attention now.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { classForStaff, classCurriculum } from "../load.js";
import { pageHead, empty, statusBadge, badge, notice } from "../ui.js";
import { formatDate, sessionsThisWeek, slotFor, today, mondayOf, ago, daysBetween, dateOf } from "../time.js";
import { HELP_STALE_DAYS, EXPORT_WARN_DAYS, PACE_VOTING_DAYS, SCHOOL_DOMAIN } from "../config.js";
import { paceWidget } from "./pace.js";

export default async function home(ctx) {
  if (ctx.me.role === "student") return studentWeek(ctx);
  if (ctx.me.role === "admin") return adminWeek(ctx);
  return teacherWeek(ctx);
}

const when = (cls) => sessionsThisWeek(cls).map((d) => {
  const s = slotFor(cls, d);
  return `${formatDate(d)} ${s.start}`;
}).join(", ") || "No session this week";

// ---------- Student ----------

async function studentWeek(ctx) {
  const memberships = await data.listMyMemberships(ctx.me);
  const classes = [];
  for (const m of memberships.filter((x) => x.cls)) {
    const cls = m.cls;
    const [projects, subs, cur, help] = await Promise.all([
      data.listProjects(cls.id), data.listMySubmissions(cls.id, ctx.me.id), classCurriculum(cls), data.listMyHelp(cls.id, ctx.me.id),
    ]);
    const week = mondayOf(today());
    const thisWeek = projects.filter((p) => p.week === week);
    const latestProject = thisWeek[0] || projects[0];
    const last = cls.lastSubmittedSession;
    // Only school accounts can vote (firestore.rules canVote), so outside accounts never see the question.
    const voted = last && ctx.me.email.endsWith(`@${SCHOOL_DOMAIN}`) && daysBetween(last, today()) < PACE_VOTING_DAYS ? await data.hasVoted(cls.id, last, ctx.me.id) : true;
    classes.push({ cls, projects: thisWeek.length ? thisWeek : latestProject ? [latestProject] : [], subs, cur, voted,
      answers: help.filter((h) => h.status === "answered") });
  }
  const pending = memberships.filter((m) => m.member.status === "pending");

  return () => html`
    ${pageHead("This week", "Hello,", ctx.me.name.split(" ")[0])}
    ${pending.map((m) => notice(`Waiting for your teacher to approve you in ${m.member.className}.`))}
    ${classes.length === 0 && pending.length === 0 ? html`
      <div class="stack prose"><p>You are not in a class yet.</p><a class="jy-btn" href="#/join">Join a class</a></div>` : nothing}
    ${classes.map(({ cls, projects, subs, cur, voted, answers }) => html`
      <section>
        <h2 class="section"><a href="#/class/${cls.id}">${cls.name}</a></h2>
        <div class="grid">
          <div class="jy-panel">
            <h3>Sessions</h3>
            <p>${when(cls)}</p>
            ${cur.current ? html`<p>We are on <a href="#/topic/${cur.current.topic.id}?class=${cls.id}">${cur.current.topic.title}</a> (${cur.current.level.title}).</p>` : nothing}
          </div>
          ${projects.map((p) => {
            const sub = subs.find((s) => s.projectId === p.id);
            return html`
              <a class="jy-panel jy-panel--link panel-link" href="#/class/${cls.id}/project/${p.id}">
                <h3>${p.title}</h3>
                <p>Week of ${p.week}</p>
                <div class="row">${statusBadge(sub?.status)}</div>
              </a>`;
          })}
          ${!voted ? html`<div class="jy-panel">${paceWidget(ctx, cls)}</div>` : nothing}
          ${answers.length ? html`
            <div class="jy-panel">
              <h3>Answers from your teacher</h3>
              ${answers.slice(0, 3).map((h) => html`<p><b>${h.projectTitle}:</b> ${h.answer}</p>`)}
            </div>` : nothing}
        </div>
      </section>`)}`;
}

// ---------- Teacher ----------

async function teacherWeek(ctx) {
  const classes = await data.listMyTeaching(ctx.me.id);
  const loaded = await Promise.all(classes.filter((c) => !c.archived).map(classForStaff));
  for (const l of loaded) l.cur = await classCurriculum(l.cls);
  return () => html`
    ${pageHead("This week", "Hello,", ctx.me.name.split(" ")[0])}
    ${loaded.length === 0 ? empty("You do not teach any classes yet. An admin adds you to a class.") : nothing}
    ${loaded.map(teacherClassPanel)}`;
}

function teacherClassPanel(l) {
  const { cls } = l;
  const base = `/class/${cls.id}`;
  return html`
    <section>
      <h2 class="section"><a href="#${base}">${cls.name}</a> <span class="muted small">${cls.track === "python" ? "Python" : "Scratch"}</span></h2>
      <div class="grid">
        <div class="jy-panel">
          <h3>Sessions</h3>
          <p>${when(cls)}</p>
          ${l.cur?.current ? html`<p>On: ${l.cur.current.topic.title} (${l.cur.at + 1} of ${l.cur.topics.length} topics)</p>` : html`<p>Set the current topic in <a href="#${base}/curriculum">Curriculum</a>.</p>`}
        </div>
        <a class="jy-panel jy-panel--link panel-link" href="#${base}/attendance">
          <h3>Attendance</h3>
          <p>${l.missing.length ? `${l.missing.length} session(s) to submit` : "All submitted"}</p>
          <div class="row">${l.missing.length ? badge("To submit", "warn") : badge("Up to date", "ok")}</div>
        </a>
        <a class="jy-panel jy-panel--link panel-link" href="#${base}/help">
          <h3>Help queue</h3>
          <p>${l.help.length ? `${l.help.length} waiting, longest ${ago(l.help[0].createdAt)}` : "Nobody waiting"}</p>
          <div class="row">${l.help.length ? badge(`${l.help.length} open`, "warn") : badge("Clear", "ok")}</div>
        </a>
        ${l.pending.length ? html`
          <a class="jy-panel jy-panel--link panel-link" href="#${base}/roster">
            <h3>Join requests</h3><p>${l.pending.length} student(s) waiting for approval</p>
          </a>` : nothing}
      </div>
    </section>`;
}

// ---------- Admin ----------

async function adminWeek(ctx) {
  const [classes, exp] = await Promise.all([data.listAllClasses(), data.getExportInfo()]);
  const loaded = await Promise.all(classes.filter((c) => !c.archived).map(classForStaff));
  const stale = loaded.flatMap((l) => l.help.filter((h) => daysBetween(dateOf(h.createdAt), today()) >= HELP_STALE_DAYS).map((h) => ({ ...h, cls: l.cls })));
  const missing = loaded.flatMap((l) => l.missing.map((d) => ({ date: d, cls: l.cls })));
  const exportDays = exp?.lastExportAt ? daysBetween(dateOf(exp.lastExportAt), today()) : null;

  return () => html`
    ${pageHead("This week", "Program", "overview")}
    ${exportDays === null || exportDays >= EXPORT_WARN_DAYS ? notice(html`${exportDays === null ? "Data has never been exported." : `Last exported ${exportDays} days ago.`} <a href="#/admin/export">Export now</a>`) : nothing}
    <div class="grid">
      <a class="jy-panel jy-panel--link panel-link" href="#/dashboard">
        <h3>Attendance not submitted</h3>
        <p>${missing.length ? `${missing.length} session(s) across ${new Set(missing.map((m) => m.cls.id)).size} class(es)` : "None"}</p>
        <div class="row">${missing.length ? badge("Flagged", "bad") : badge("Up to date", "ok")}</div>
      </a>
      <a class="jy-panel jy-panel--link panel-link" href="#/dashboard">
        <h3>Help waiting ${HELP_STALE_DAYS}+ days</h3>
        <p>${stale.length ? `${stale.length} request(s)` : "None"}</p>
        <div class="row">${stale.length ? badge("Flagged", "bad") : badge("Clear", "ok")}</div>
      </a>
      <div class="jy-panel">
        <h3>Classes</h3>
        <p>${loaded.length} active, ${loaded.reduce((n, l) => n + l.approved.length, 0)} students</p>
      </div>
    </div>`;
}

// Fills the LOCAL EMULATORS with fake data so you can click around. Never point this at
// the real project: it only talks to 127.0.0.1. Every name and email here is invented.
//
// VS Code terminal 1: npm run emulators
// VS Code terminal 2: npm run seed      then: npm run dev   and sign in as one of the emails below.
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { today, addDays, mondayOf, endedSessions } from "../src/time.js";

const PROJECT = process.env.SEED_PROJECT || "demo-stjbs";
const AUTH = "http://127.0.0.1:9099";

export const PEOPLE = [
  { key: "admin", email: "faculty.admin@stjbs.sch.id", name: "Faculty Admin", role: "admin" },
  { key: "club", email: "stjbscodingclub@gmail.com", name: "Coding Club", role: "admin" },
  { key: "ta", email: "tara.teacher@stjbs.sch.id", name: "Tara Teacher", role: "teacher" },
  { key: "tb", email: "ben.teacher@stjbs.sch.id", name: "Ben Teacher", role: "teacher" },
  { key: "s1", email: "ana.student@stjbs.sch.id", name: "Ana Student", role: "student" },
  { key: "s2", email: "budi.student@stjbs.sch.id", name: "Budi Student", role: "student" },
  { key: "s3", email: "citra.student@stjbs.sch.id", name: "Citra Student", role: "student" },
  { key: "s4", email: "dewi.student@stjbs.sch.id", name: "Dewi Student", role: "student" },
  { key: "s5", email: "eko.student@stjbs.sch.id", name: "Eko Student", role: "student" },
  { key: "s6", email: "fajar.student@stjbs.sch.id", name: "Fajar Student", role: "student" },
  { key: "s7", email: "gita.student@stjbs.sch.id", name: "Gita Student", role: "student" },
];

// Creates (or finds) the emulator Auth user for a Google account and returns its uid.
// The same fake token is used by the app's test sign-in, so both get the same uid.
async function authUser(p) {
  const idToken = JSON.stringify({ sub: p.email, email: p.email, email_verified: true, name: p.name });
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`, requestUri: "http://localhost", returnSecureToken: true }),
  });
  const json = await res.json();
  if (!json.localId) throw new Error("Auth emulator did not return a user: " + JSON.stringify(json));
  return json.localId;
}

const ts = (daysAgo) => Timestamp.fromMillis(Date.now() - daysAgo * 86_400_000);

export async function seed() {
  const uid = {};
  for (const p of PEOPLE) uid[p.key] = await authUser(p);
  const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { host: "127.0.0.1", port: 8080 } });
  await env.clearFirestore();
  const curriculum = JSON.parse(readFileSync(new URL("../curriculum/curriculum.json", import.meta.url), "utf8"));
  const t = today();

  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    const set = (path, value) => setDoc(doc(f, path), value);
    const person = (k) => PEOPLE.find((p) => p.key === k);

    for (const p of PEOPLE) {
      await set(`users/${uid[p.key]}`, { email: p.email, name: p.name, role: p.role, classIds: [], createdAt: ts(60) });
    }
    await set("config/access", { extraEmails: ["stjbscodingclub@gmail.com"] });
    await set("config/curriculum", { latest: 1, maxVersion: 1 });
    await set("curriculumVersions/1", { version: 1, data: curriculum, notes: "First version (sample content)", publishedAt: ts(50), publishedBy: "faculty.admin@stjbs.sch.id", errata: [] });
    await set("config/export", { lastExportAt: ts(20), by: "faculty.admin@stjbs.sch.id" });

    // Python class: Tuesdays and Thursdays, term started six weeks ago.
    const py = {
      name: "Python Sec 1", track: "python", teacherIds: [uid.ta], teacherNames: { [uid.ta]: "Tara Teacher" },
      schedule: [{ weekday: 2, start: "15:00", minutes: 60 }, { weekday: 4, start: "15:00", minutes: 60 }],
      termStart: addDays(t, -42), termEnd: addDays(t, 90), joinCode: "PYTH24", defaultPresent: true,
      pointer: { levelId: "py-l1", topicId: "py-variables" }, pins: { "py-l1": 1 }, lastSubmittedSession: "", archived: false, createdAt: ts(45),
    };
    const sc = {
      name: "Scratch Primary 5", track: "scratch", teacherIds: [uid.tb], teacherNames: { [uid.tb]: "Ben Teacher" },
      schedule: [{ weekday: 3, start: "14:00", minutes: 60 }], termStart: addDays(t, -42), termEnd: addDays(t, 90),
      joinCode: "SCRT56", defaultPresent: false, pointer: { levelId: "sc-l1", topicId: "sc-motion" }, pins: { "sc-l1": 1 },
      lastSubmittedSession: "", archived: false, createdAt: ts(45),
    };
    await set("joinCodes/PYTH24", { classId: "py1", className: py.name });
    await set("joinCodes/SCRT56", { classId: "sc1", className: sc.name });

    const member = (cid, cls, k, status, code) => set(`classes/${cid}/members/${uid[k]}`, {
      uid: uid[k], name: person(k).name, email: person(k).email, code, className: cls.name, status, requestedAt: ts(30),
    });
    for (const k of ["s1", "s2", "s3", "s4", "s5"]) await member("py1", py, k, "approved", "PYTH24");
    await member("py1", py, "s6", "pending", "PYTH24");
    await member("sc1", sc, "s7", "approved", "SCRT56");
    for (const k of ["s1", "s2", "s3", "s4", "s5", "s6"]) await set(`users/${uid[k]}`, { email: person(k).email, name: person(k).name, role: "student", classIds: ["py1"], createdAt: ts(60) });
    await set(`users/${uid.s7}`, { email: person("s7").email, name: person("s7").name, role: "student", classIds: ["sc1"], createdAt: ts(60) });

    // Attendance: every ended session submitted except the most recent one (so it is flagged).
    const ended = endedSessions(py);
    const submitted = ended.slice(0, -1);
    for (const [i, date] of submitted.entries()) {
      const marks = Object.fromEntries(["s1", "s2", "s3", "s4", "s5"].map((k, j) => [uid[k], (i + j) % 7 === 0 ? "absent" : "present"]));
      await set(`classes/py1/sessions/${date}`, { date, status: "submitted", marks, rev: 1, deleted: false, updatedAt: ts(1), updatedBy: uid.ta });
      await set(`classes/py1/sessions/${date}/history/1`, { rev: 1, at: ts(1), by: uid.ta, byName: "Tara Teacher", status: "submitted", marks, deleted: false });
    }
    const lastDone = submitted[submitted.length - 1];
    if (lastDone) {
      py.lastSubmittedSession = lastDone;
      await set(`classes/py1/pace/${submitted[0]}`, { easy: 1, right: 3, hard: 1, n: 5 });
    }
    await set("classes/py1", py);
    await set("classes/sc1", sc);

    // This week's projects.
    const week = mondayOf(t);
    const topic = curriculum.tracks[0].levels[0].topics[0];
    await set("classes/py1/projects/w1", { title: "Name card and text art", week, topicId: topic.id,
      options: topic.projects.map((o) => ({ id: o.id, title: o.title, brief: o.brief, starter: o.starter })), createdAt: ts(2), createdBy: uid.ta, deleted: false });
    await set("classes/py1/projects/w0", { title: "Hello, world", week: addDays(week, -7), topicId: topic.id,
      options: [{ id: "hello", title: "Hello, world", brief: "Print a greeting.", starter: "" }], createdAt: ts(9), createdBy: uid.ta, deleted: false });
    const scTopic = curriculum.tracks[1].levels[0].topics[0];
    await set("classes/sc1/projects/w1", { title: "Dance party or race", week, topicId: scTopic.id,
      options: scTopic.projects.map((o) => ({ id: o.id, title: o.title, brief: o.brief, starter: "" })), createdAt: ts(2), createdBy: uid.tb, deleted: false });

    const sub = (k, pid, status, code, lastError = "") => set(`classes/py1/submissions/${uid[k]}_${pid}`, {
      uid: uid[k], name: person(k).name, projectId: pid, optionId: pid === "w0" ? "hello" : "py-print-card", code, scratchUrl: "", status, lastError, updatedAt: ts(1),
    });
    await sub("s1", "w0", "done", 'print("Hello, world")');
    await sub("s2", "w0", "done", 'print("Hi")');
    await sub("s1", "w1", "in_progress", 'print("+----------+")\nprint("| Ana      |")');
    await sub("s3", "w1", "needs_help", 'print("+------+"\nprint("| Citra |")', 'File "main.py", line 1\nSyntaxError: \'(\' was never closed');
    await set("classes/py1/help/h1", { uid: uid.s3, name: "Citra Student", projectId: "w1", projectTitle: "Name card and text art",
      code: 'print("+------+"\nprint("| Citra |")', scratchUrl: "", error: 'File "main.py", line 1\nSyntaxError: \'(\' was never closed',
      note: "My border will not print", status: "open", createdAt: ts(4) });
  });
  await env.cleanup();
  return uid;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().then(() => {
    console.log("ok seeded fake data into the emulators. Sign in as any of:");
    for (const p of PEOPLE) console.log(`   ${p.role.padEnd(8)} ${p.email}`);
  }).catch((e) => { console.error("x", e.message); process.exit(1); });
}

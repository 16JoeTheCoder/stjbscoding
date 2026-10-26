// Firestore security rules tests. Run: npm run test:rules (starts the emulator for you).
// Every role is tried against every collection. A test named "denies ..." must fail to read or write.
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where,
  writeBatch, increment, arrayUnion, serverTimestamp,
} from "firebase/firestore";

const NOW = serverTimestamp();

// Session dates relative to today: the rules refuse future sessions and close pace voting after 7 days.
import { today, addDays } from "../../src/time.js";
const D1 = addDays(today(), -3), D2 = addDays(today(), -2), D3 = addDays(today(), -1);
const OLD = addDays(today(), -10);   // rules require server time on every timestamp a user writes

let env;
const C = "class1";   // Python class taught by teacher T1, student S1 approved, S2 pending
const C2 = "class2";  // class taught by T2; S3 approved

const people = {
  admin: { uid: "admin", email: "ariel@stjbs.sch.id", role: "admin" },
  t1: { uid: "t1", email: "teacher1@stjbs.sch.id", role: "teacher" },
  t2: { uid: "t2", email: "teacher2@stjbs.sch.id", role: "teacher" },
  s1: { uid: "s1", email: "student1@stjbs.sch.id", role: "student" },
  s2: { uid: "s2", email: "student2@stjbs.sch.id", role: "student" },
  s3: { uid: "s3", email: "student3@stjbs.sch.id", role: "student" },
  club: { uid: "club", email: "stjbscodingclub@gmail.com", role: "admin" },
};

function token(email, extra = {}) {
  return { email, email_verified: true, firebase: { sign_in_provider: "google.com" }, ...extra };
}
function as(p, extra) {
  return env.authenticatedContext(p.uid, token(p.email, extra)).firestore();
}
const db = {
  get admin() { return as(people.admin); },
  get t1() { return as(people.t1); },
  get t2() { return as(people.t2); },
  get s1() { return as(people.s1); },
  get s2() { return as(people.s2); },
  get s3() { return as(people.s3); },
  get club() { return as(people.club); },
  get anon() { return env.unauthenticatedContext().firestore(); },
};

const classData = (name, teacherIds, code) => ({
  name, track: "python", teacherIds, teacherNames: {}, schedule: [{ weekday: 2, start: "15:00", minutes: 60 }],
  termStart: "2026-07-13", termEnd: "2026-12-04", joinCode: code, defaultPresent: true,
  pointer: null, pins: { "py-l1": 1 }, lastSubmittedSession: "", archived: false, createdAt: 1,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-stjbs-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    for (const p of Object.values(people)) {
      await setDoc(doc(f, "users", p.uid), { email: p.email, name: p.uid, role: p.role, classIds: [], createdAt: 1 });
    }
    await setDoc(doc(f, "config/access"), { extraEmails: ["stjbscodingclub@gmail.com"] });
    await setDoc(doc(f, "config/curriculum"), { latest: 1, maxVersion: 1 });
    await setDoc(doc(f, "config/export"), { lastExportAt: 1, by: "admin" });
    await setDoc(doc(f, "curriculumVersions/1"), { version: 1, data: { tracks: [] }, notes: "", publishedAt: 1, publishedBy: "admin", errata: [] });
    await setDoc(doc(f, "classes", C), { ...classData("Python A", ["t1"], "ABCDEF"), lastSubmittedSession: D1 });
    await setDoc(doc(f, "classes", C2), classData("Python B", ["t2"], "GHJKLM"));
    await setDoc(doc(f, "joinCodes/ABCDEF"), { classId: C, className: "Python A" });
    await setDoc(doc(f, "joinCodes/GHJKLM"), { classId: C2, className: "Python B" });
    const member = (uid, status) => ({ uid, name: uid, email: people[uid].email, code: "ABCDEF", className: "Python A", status, requestedAt: 1 });
    await setDoc(doc(f, `classes/${C}/members/s1`), member("s1", "approved"));
    await setDoc(doc(f, `classes/${C}/members/s2`), member("s2", "pending"));
    await setDoc(doc(f, `classes/${C2}/members/s3`), { ...member("s3", "approved"), code: "GHJKLM" });
    await setDoc(doc(f, `classes/${C}/projects/p1`), { title: "Week 1", week: "2026-07-13", topicId: "t", options: [{ id: "a", title: "A" }], createdAt: 1, createdBy: "t1", deleted: false });
    await setDoc(doc(f, `classes/${C}/submissions/s1_p1`), { uid: "s1", name: "s1", projectId: "p1", optionId: "a", code: "print(1)", scratchUrl: "", status: "in_progress", lastError: "", updatedAt: 1 });
    await setDoc(doc(f, `classes/${C}/help/h1`), { uid: "s1", name: "s1", projectId: "p1", projectTitle: "Week 1", code: "x", scratchUrl: "", error: "", note: "", status: "open", createdAt: 1 });
    await setDoc(doc(f, `classes/${C}/sessions/${D1}`), { date: D1, status: "submitted", marks: { s1: "present" }, rev: 1, deleted: false, updatedAt: 1, updatedBy: "t1" });
    await setDoc(doc(f, `classes/${C}/sessions/${D1}/history/1`), { rev: 1, at: 1, by: "t1", byName: "t1", status: "submitted", marks: { s1: "present" }, deleted: false });
  });
});

// ---------- Sign-in restrictions ----------

test("denies unauthenticated users everything", async () => {
  await assertFails(getDoc(doc(db.anon, "classes", C)));
  await assertFails(getDoc(doc(db.anon, "config/curriculum")));
  await assertFails(getDoc(doc(db.anon, "joinCodes/ABCDEF")));
});

test("denies non-school Google accounts that are not on the allowlist", async () => {
  const outsider = env.authenticatedContext("out", token("someone@gmail.com")).firestore();
  await assertFails(setDoc(doc(outsider, "users/out"), { email: "someone@gmail.com", name: "x", role: "student", classIds: [], createdAt: NOW }));
  await assertFails(getDoc(doc(outsider, "config/curriculum")));
  await assertFails(getDoc(doc(outsider, "joinCodes/ABCDEF")));
});

test("denies look-alike domains", async () => {
  for (const email of ["x@stjbs.sch.id.evil.com", "x@evilstjbs.sch.id", "x@stjbsxsch.id"]) {
    const f = env.authenticatedContext("u", token(email)).firestore();
    await assertFails(setDoc(doc(f, "users/u"), { email, name: "x", role: "student", classIds: [], createdAt: NOW }));
  }
});

test("denies unverified school emails and non-Google sign-in", async () => {
  const unverified = env.authenticatedContext("u", token("new@stjbs.sch.id", { email_verified: false })).firestore();
  await assertFails(getDoc(doc(unverified, "config/curriculum")));
  const password = env.authenticatedContext("u", token("new@stjbs.sch.id", { firebase: { sign_in_provider: "password" } })).firestore();
  await assertFails(getDoc(doc(password, "config/curriculum")));
});

test("allows the allowlisted club account (non-school email)", async () => {
  await assertSucceeds(getDoc(doc(db.club, "classes", C)));
});

// ---------- Users ----------

test("a new school user can create only their own student profile", async () => {
  const f = env.authenticatedContext("new", token("new@stjbs.sch.id")).firestore();
  const base = { email: "new@stjbs.sch.id", name: "New", classIds: [], createdAt: NOW };
  await assertFails(setDoc(doc(f, "users/new"), { ...base, role: "admin" }));
  await assertFails(setDoc(doc(f, "users/new"), { ...base, role: "teacher" }));
  await assertFails(setDoc(doc(f, "users/other"), { ...base, role: "student" }));
  await assertFails(setDoc(doc(f, "users/new"), { ...base, email: "fake@stjbs.sch.id", role: "student" }));
  await assertSucceeds(setDoc(doc(f, "users/new"), { ...base, role: "student" }));
});

test("users cannot promote themselves; only admins change roles", async () => {
  await assertFails(updateDoc(doc(db.s1, "users/s1"), { role: "admin" }));
  await assertFails(updateDoc(doc(db.t1, "users/t1"), { role: "admin" }));
  await assertFails(updateDoc(doc(db.t1, "users/s1"), { role: "teacher" }));
  await assertSucceeds(updateDoc(doc(db.admin, "users/s1"), { role: "teacher" }));
  await assertFails(updateDoc(doc(db.admin, "users/s1"), { role: "superuser" }));
  await assertFails(updateDoc(doc(db.admin, "users/s1"), { email: "x@stjbs.sch.id" }));
});

test("users read only their own profile; admins read all", async () => {
  await assertSucceeds(getDoc(doc(db.s1, "users/s1")));
  await assertFails(getDoc(doc(db.s1, "users/s2")));
  await assertFails(getDoc(doc(db.t1, "users/s1")));
  await assertFails(getDocs(collection(db.t1, "users")));
  await assertSucceeds(getDocs(collection(db.admin, "users")));
  await assertSucceeds(updateDoc(doc(db.s1, "users/s1"), { classIds: arrayUnion(C) }));
});

// ---------- Config ----------

test("config: everyone signed in reads curriculum pointer; only admins read or write the rest", async () => {
  await assertSucceeds(getDoc(doc(db.s1, "config/curriculum")));
  await assertFails(getDoc(doc(db.s1, "config/access")));
  await assertFails(getDoc(doc(db.t1, "config/export")));
  await assertFails(setDoc(doc(db.t1, "config/curriculum"), { latest: 2, maxVersion: 2 }));
  await assertFails(setDoc(doc(db.s1, "config/access"), { extraEmails: ["me@gmail.com"] }));
  await assertSucceeds(setDoc(doc(db.admin, "config/export"), { lastExportAt: 2, by: "admin" }));
  await assertFails(setDoc(doc(db.admin, "config/anything"), { x: 1 }));
});

test("curriculum versions: everyone reads, only admins write, nobody deletes", async () => {
  await assertSucceeds(getDoc(doc(db.s1, "curriculumVersions/1")));
  const v2 = { version: 2, data: { tracks: [] }, notes: "", publishedAt: 1, publishedBy: "admin", errata: [] };
  await assertFails(setDoc(doc(db.t1, "curriculumVersions/2"), v2));
  await assertFails(setDoc(doc(db.admin, "curriculumVersions/3"), v2));
  await assertSucceeds(setDoc(doc(db.admin, "curriculumVersions/2"), v2));
  await assertFails(updateDoc(doc(db.admin, "curriculumVersions/1"), { version: 9 }));
  await assertSucceeds(updateDoc(doc(db.admin, "curriculumVersions/1"), { errata: [{ note: "typo" }] }));
  await assertFails(deleteDoc(doc(db.admin, "curriculumVersions/1")));
});

// ---------- Join codes and classes ----------

test("join codes: get by exact code only, never list", async () => {
  await assertSucceeds(getDoc(doc(db.s2, "joinCodes/ABCDEF")));
  await assertFails(getDocs(collection(db.s2, "joinCodes")));
  await assertFails(setDoc(doc(db.s1, "joinCodes/ZZZZZZ"), { classId: C, className: "x" }));
});

test("a teacher can replace their class's join code but not another class's", async () => {
  const t1 = db.t1;
  const b = writeBatch(t1);
  b.update(doc(t1, "classes", C), { joinCode: "NPQRST" });
  b.set(doc(t1, "joinCodes/NPQRST"), { classId: C, className: "Python A" });
  b.delete(doc(t1, "joinCodes/ABCDEF"));
  await assertSucceeds(b.commit());
  const b2 = writeBatch(t1);
  b2.update(doc(t1, "classes", C2), { joinCode: "UVWXYZ" });
  b2.set(doc(t1, "joinCodes/UVWXYZ"), { classId: C2, className: "x" });
  await assertFails(b2.commit());
  await assertFails(deleteDoc(doc(db.t1, "joinCodes/GHJKLM")));
});

test("classes: students read only classes they are approved in", async () => {
  await assertSucceeds(getDoc(doc(db.s1, "classes", C)));
  await assertFails(getDoc(doc(db.s2, "classes", C)));   // pending
  await assertFails(getDoc(doc(db.s1, "classes", C2)));
  await assertFails(getDocs(collection(db.s1, "classes")));
});

test("classes: teachers read and list only classes they teach", async () => {
  await assertSucceeds(getDoc(doc(db.t1, "classes", C)));
  await assertFails(getDoc(doc(db.t1, "classes", C2)));
  await assertSucceeds(getDocs(query(collection(db.t1, "classes"), where("teacherIds", "array-contains", "t1"))));
  await assertFails(getDocs(collection(db.t1, "classes")));
  await assertSucceeds(getDocs(collection(db.admin, "classes")));
});

test("a demoted teacher loses access even if still listed on the class", async () => {
  await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "users/t1"), { role: "student" }));
  await assertFails(getDoc(doc(db.t1, "classes", C)));
  await assertFails(getDocs(collection(db.t1, `classes/${C}/members`)));
});

test("classes: only admins create; teachers change only their allowed fields; pins never change", async () => {
  await assertFails(setDoc(doc(db.t1, "classes/new"), classData("x", ["t1"], "QQQQQQ")));
  await assertSucceeds(setDoc(doc(db.admin, "classes/new"), classData("x", ["t1"], "QQQQQQ")));
  await assertSucceeds(updateDoc(doc(db.t1, "classes", C), { pointer: { levelId: "py-l2", topicId: "x" }, "pins.py-l2": 1 }));
  await assertFails(updateDoc(doc(db.t1, "classes", C), { "pins.py-l1": 2 }));
  await assertSucceeds(updateDoc(doc(db.admin, "classes", C), { "pins.py-l1": 2 }));   // admins may correct a pin (trusted, DECISIONS D20)
  await assertFails(updateDoc(doc(db.t1, "classes", C), { teacherIds: ["t1", "s1"] }));
  await assertFails(updateDoc(doc(db.t2, "classes", C), { defaultPresent: false }));
  await assertFails(updateDoc(doc(db.s1, "classes", C), { defaultPresent: false }));
  await assertFails(deleteDoc(doc(db.admin, "classes", C)));
});

// ---------- Members ----------

test("joining: a student may request with a valid code for that class only", async () => {
  const req = (code) => ({ uid: "s3", name: "s3", email: people.s3.email, code, className: "Python A", status: "pending", requestedAt: NOW });
  await assertFails(setDoc(doc(db.s3, `classes/${C}/members/s3`), req("GHJKLM")));   // code of another class
  await assertFails(setDoc(doc(db.s3, `classes/${C}/members/s3`), { ...req("ABCDEF"), status: "approved" }));
  await assertFails(setDoc(doc(db.s3, `classes/${C}/members/s1`), req("ABCDEF")));
  await assertSucceeds(setDoc(doc(db.s3, `classes/${C}/members/s3`), req("ABCDEF")));
});

test("joining: a student cannot approve themselves; the class teacher can", async () => {
  await assertFails(updateDoc(doc(db.s2, `classes/${C}/members/s2`), { status: "approved" }));
  await assertFails(updateDoc(doc(db.t2, `classes/${C}/members/s2`), { status: "approved" }));
  await assertSucceeds(updateDoc(doc(db.t1, `classes/${C}/members/s2`), { status: "approved", decidedAt: NOW, decidedBy: "t1" }));
  await assertFails(updateDoc(doc(db.t1, `classes/${C}/members/s2`), { name: "renamed" }));
  await assertFails(deleteDoc(doc(db.t1, `classes/${C}/members/s2`)));
});

test("members: a student reads only their own membership; teachers only their class roster", async () => {
  await assertSucceeds(getDoc(doc(db.s2, `classes/${C}/members/s2`)));
  await assertFails(getDoc(doc(db.s2, `classes/${C}/members/s1`)));
  await assertFails(getDocs(collection(db.s1, `classes/${C}/members`)));
  await assertSucceeds(getDocs(collection(db.t1, `classes/${C}/members`)));
  await assertFails(getDocs(collection(db.t2, `classes/${C}/members`)));
  await assertSucceeds(getDocs(collection(db.admin, `classes/${C}/members`)));
});

// ---------- Projects and submissions ----------

test("projects: approved members and class teachers read; only class teachers write", async () => {
  await assertSucceeds(getDocs(collection(db.s1, `classes/${C}/projects`)));
  await assertFails(getDocs(collection(db.s2, `classes/${C}/projects`)));
  await assertFails(getDocs(collection(db.s3, `classes/${C}/projects`)));
  await assertFails(getDocs(collection(db.t2, `classes/${C}/projects`)));
  const p = { title: "Week 2", week: "2026-07-20", topicId: "t", options: [{ id: "a", title: "A" }], createdAt: NOW, createdBy: "t1", deleted: false };
  await assertFails(setDoc(doc(db.s1, `classes/${C}/projects/p2`), p));
  await assertFails(setDoc(doc(db.admin, `classes/${C}/projects/p2`), p));
  await assertSucceeds(setDoc(doc(db.t1, `classes/${C}/projects/p2`), p));
});

const sub = (uid, extra = {}) => ({ uid, name: uid, projectId: "p1", optionId: "a", code: "print(2)", scratchUrl: "", status: "done", lastError: "", updatedAt: NOW, ...extra });

test("submissions: a student writes only their own, in a class they belong to", async () => {
  await assertSucceeds(setDoc(doc(db.s1, `classes/${C}/submissions/s1_p1`), sub("s1")));
  await assertFails(setDoc(doc(db.s1, `classes/${C}/submissions/s2_p1`), sub("s2")));
  await assertFails(setDoc(doc(db.s1, `classes/${C}/submissions/s1_p1`), sub("s1", { status: "graded" })));
  await assertFails(setDoc(doc(db.s1, `classes/${C}/submissions/s1_p9`), sub("s1", { projectId: "p9" })));
  await assertFails(setDoc(doc(db.s2, `classes/${C}/submissions/s2_p1`), sub("s2")));   // pending member
  await assertFails(setDoc(doc(db.s1, `classes/${C}/submissions/s1_p1`), sub("s1", { scratchUrl: "https://evil.example/x" })));
  await assertFails(setDoc(doc(db.t1, `classes/${C}/submissions/s1_p1`), sub("s1")));
});

test("submissions: a student cannot read another student's work", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `classes/${C}/members/s2`), { uid: "s2", name: "s2", email: people.s2.email, code: "ABCDEF", className: "x", status: "approved", requestedAt: 1 }));
  await assertFails(getDoc(doc(db.s2, `classes/${C}/submissions/s1_p1`)));
  await assertFails(getDocs(collection(db.s2, `classes/${C}/submissions`)));
  await assertSucceeds(getDocs(query(collection(db.s2, `classes/${C}/submissions`), where("uid", "==", "s2"))));
  await assertSucceeds(getDoc(doc(db.s1, `classes/${C}/submissions/s1_p1`)));
  await assertSucceeds(getDoc(doc(db.s1, `classes/${C}/submissions/s1_p2`)));   // not created yet: allowed to look
  await assertSucceeds(getDocs(collection(db.t1, `classes/${C}/submissions`)));
  await assertFails(getDocs(collection(db.t2, `classes/${C}/submissions`)));
  await assertSucceeds(getDocs(collection(db.admin, `classes/${C}/submissions`)));
});

// ---------- Help requests ----------

const help = (uid, extra = {}) => ({ uid, name: uid, email: people[uid].email, projectId: "p1", projectTitle: "Week 1", code: "x", scratchUrl: "", error: "NameError", note: "", status: "open", createdAt: NOW, ...extra });

test("help: approved students create their own open request only", async () => {
  await assertSucceeds(setDoc(doc(db.s1, `classes/${C}/help/h2`), help("s1")));
  await assertFails(setDoc(doc(db.s1, `classes/${C}/help/h3`), help("s2")));
  await assertFails(setDoc(doc(db.s1, `classes/${C}/help/h4`), help("s1", { status: "answered" })));
  await assertFails(setDoc(doc(db.s3, `classes/${C}/help/h5`), help("s3")));
});

test("help: students read only their own; teachers only their class queue", async () => {
  await assertSucceeds(getDocs(query(collection(db.s1, `classes/${C}/help`), where("uid", "==", "s1"))));
  await assertFails(getDocs(collection(db.s1, `classes/${C}/help`)));
  await assertFails(getDoc(doc(db.s3, `classes/${C}/help/h1`)));
  await assertSucceeds(getDocs(query(collection(db.t1, `classes/${C}/help`), where("status", "==", "open"))));
  await assertFails(getDocs(collection(db.t2, `classes/${C}/help`)));
  await assertSucceeds(getDocs(collection(db.admin, `classes/${C}/help`)));
});

test("help: only the class teacher answers; the student may only close", async () => {
  const answer = { status: "answered", answer: "Check line 3", answeredBy: "t1", answeredByName: "t1", answeredAt: NOW };
  await assertFails(updateDoc(doc(db.s1, `classes/${C}/help/h1`), answer));
  await assertFails(updateDoc(doc(db.t2, `classes/${C}/help/h1`), { ...answer, answeredBy: "t2" }));
  await assertFails(updateDoc(doc(db.admin, `classes/${C}/help/h1`), { ...answer, answeredBy: "admin" }));
  await assertFails(updateDoc(doc(db.t1, `classes/${C}/help/h1`), { ...answer, answeredBy: "someone" }));
  await assertSucceeds(updateDoc(doc(db.t1, `classes/${C}/help/h1`), answer));
  await assertFails(updateDoc(doc(db.s1, `classes/${C}/help/h1`), { status: "closed", closedAt: NOW }));   // no longer open
});

test("help: student can close their own open request", async () => {
  await assertSucceeds(updateDoc(doc(db.s1, `classes/${C}/help/h1`), { status: "closed", closedAt: NOW }));
});

// ---------- Attendance ----------

function sessionBatch(f, date, rev, extra = {}) {
  const { closeVoting, ...fields } = extra;
  const s = { date, status: "submitted", marks: { s1: "absent" }, rev, deleted: false, updatedAt: NOW, updatedBy: "t1", ...fields };
  const b = writeBatch(f);
  b.set(doc(f, `classes/${C}/sessions/${date}`), s);
  b.set(doc(f, `classes/${C}/sessions/${date}/history/${rev}`), { rev, at: NOW, by: s.updatedBy, byName: s.updatedBy, status: s.status, marks: s.marks, deleted: s.deleted });
  if (closeVoting) b.update(doc(f, "classes", C), { lastSubmittedSession: date });
  return b;
}

test("attendance: the class teacher submits with a history entry", async () => {
  await assertSucceeds(sessionBatch(db.t1, D2, 1).commit());
  await assertSucceeds(sessionBatch(db.t1, D1, 2).commit());   // edit = rev + 1
});

test("attendance: denies writes without history, wrong rev, or by others", async () => {
  await assertFails(setDoc(doc(db.t1, `classes/${C}/sessions/${D3}`), { date: D3, status: "submitted", marks: {}, rev: 1, deleted: false, updatedAt: NOW, updatedBy: "t1" }));
  await assertFails(sessionBatch(db.t1, D1, 5).commit());
  await assertFails(sessionBatch(db.t1, D1, 1).commit());
  await assertFails(sessionBatch(db.t2, D2, 1, { updatedBy: "t2" }).commit());
  await assertFails(sessionBatch(db.s1, D2, 1, { updatedBy: "s1" }).commit());
  await assertFails(sessionBatch(db.admin, D2, 1, { updatedBy: "admin" }).commit());
});

test("attendance: history cannot be rewritten and sessions cannot be hard-deleted", async () => {
  await assertFails(setDoc(doc(db.t1, `classes/${C}/sessions/${D1}/history/1`), { rev: 1, at: 9, by: "t1", byName: "t1", status: "submitted", marks: {}, deleted: false }));
  await assertFails(deleteDoc(doc(db.t1, `classes/${C}/sessions/${D1}/history/1`)));
  await assertFails(deleteDoc(doc(db.t1, `classes/${C}/sessions/${D1}`)));
  await assertSucceeds(sessionBatch(db.t1, D1, 2, { deleted: true }).commit());   // soft delete
});

test("attendance: history entry must match the session it records", async () => {
  const t1 = db.t1;
  const b = writeBatch(t1);
  b.set(doc(t1, `classes/${C}/sessions/${D2}`), { date: D2, status: "submitted", marks: { s1: "absent" }, rev: 1, deleted: false, updatedAt: NOW, updatedBy: "t1" });
  b.set(doc(t1, `classes/${C}/sessions/${D2}/history/1`), { rev: 1, at: NOW, by: "t1", byName: "t1", status: "submitted", marks: { s1: "present" }, deleted: false });
  await assertFails(b.commit());
});

test("attendance: students and other teachers cannot read sessions", async () => {
  await assertFails(getDoc(doc(db.s1, `classes/${C}/sessions/${D1}`)));
  await assertFails(getDocs(collection(db.t2, `classes/${C}/sessions`)));
  await assertSucceeds(getDocs(collection(db.t1, `classes/${C}/sessions`)));
  await assertSucceeds(getDocs(collection(db.admin, `classes/${C}/sessions`)));
  await assertSucceeds(getDocs(collection(db.admin, `classes/${C}/sessions/${D1}/history`)));
});

// ---------- Pace feedback (anonymity) ----------

function vote(f, uid, date, choice, before) {
  const b = writeBatch(f);
  const pace = doc(f, `classes/${C}/pace/${date}`);
  if (before) b.update(pace, { [choice]: increment(1), n: increment(1) });
  else b.set(pace, { easy: 0, right: 0, hard: 0, n: 1, [choice]: 1 });
  b.set(doc(f, `classes/${C}/pace/${date}/voters/${uid}`), {});
  return b.commit();
}

async function addApprovedStudents(n) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (let i = 0; i < n; i++) {
      await setDoc(doc(ctx.firestore(), `classes/${C}/members/v${i}`), { uid: `v${i}`, name: "v", email: `v${i}@stjbs.sch.id`, code: "ABCDEF", className: "x", status: "approved", requestedAt: 1 });
      await setDoc(doc(ctx.firestore(), `users/v${i}`), { email: `v${i}@stjbs.sch.id`, name: "v", role: "student", classIds: [], createdAt: 1 });
    }
  });
}
const voter = (i) => env.authenticatedContext(`v${i}`, token(`v${i}@stjbs.sch.id`)).firestore();

test("pace: an approved student votes once, only after attendance is submitted", async () => {
  await assertSucceeds(vote(db.s1, "s1", D1, "hard", false));
  await assertFails(vote(db.s1, "s1", D1, "easy", true));   // second vote
  await assertFails(vote(db.s1, "s1", D2, "easy", false));  // no submitted session
  await assertFails(vote(db.s2, "s2", D1, "easy", true));   // pending member
  await assertFails(vote(db.s3, "s3", D1, "easy", true));   // other class
});

test("pace: denies tampering with totals", async () => {
  await assertFails(setDoc(doc(db.s1, `classes/${C}/pace/${D1}`), { easy: 5, right: 0, hard: 0, n: 5 }));
  const s1 = db.s1;
  const b = writeBatch(s1);
  b.set(doc(s1, `classes/${C}/pace/${D1}`), { easy: 1, right: 0, hard: 0, n: 1 });
  b.set(doc(s1, `classes/${C}/pace/${D1}/voters/s2`), {});   // someone else's marker
  await assertFails(b.commit());
  const b2 = writeBatch(s1);
  b2.set(doc(s1, `classes/${C}/pace/${D1}`), { easy: 1, right: 0, hard: 0, n: 1 });
  b2.set(doc(s1, `classes/${C}/pace/${D1}/voters/s1`), { vote: "easy" });   // vote next to a name
  await assertFails(b2.commit());
});

test("pace: nobody can see who voted, and totals stay hidden below 5 responses", async () => {
  await addApprovedStudents(5);
  await vote(db.s1, "s1", D1, "right", false);
  for (let i = 0; i < 3; i++) await vote(voter(i), `v${i}`, D1, "easy", true);
  // 4 responses: hidden from everyone
  await assertFails(getDoc(doc(db.t1, `classes/${C}/pace/${D1}`)));
  await assertFails(getDoc(doc(db.admin, `classes/${C}/pace/${D1}`)));
  // who voted: never readable by teacher or admin, in any way
  for (const f of [db.t1, db.admin]) {
    await assertFails(getDoc(doc(f, `classes/${C}/pace/${D1}/voters/s1`)));
    await assertFails(getDocs(collection(f, `classes/${C}/pace/${D1}/voters`)));
  }
  await assertSucceeds(getDoc(doc(db.s1, `classes/${C}/pace/${D1}/voters/s1`)));   // "you voted"
  await assertFails(getDoc(doc(db.s1, `classes/${C}/pace/${D1}/voters/v0`)));
  await assertFails(getDoc(doc(db.s1, `classes/${C}/pace/${D1}`)));
  // fifth response: still hidden while voting is open, so nobody can watch single votes arrive
  await vote(voter(3), "v3", D1, "hard", true);
  await assertFails(getDoc(doc(db.t1, `classes/${C}/pace/${D1}`)));
  await assertFails(getDoc(doc(db.admin, `classes/${C}/pace/${D1}`)));
  // the next session is submitted: voting on 07-14 closes, totals become readable to the class teacher and admin
  await assertSucceeds(sessionBatch(db.t1, D2, 1, { closeVoting: true }).commit());
  await assertFails(vote(voter(4), "v4", D1, "easy", true));   // closed
  await assertSucceeds(getDoc(doc(db.t1, `classes/${C}/pace/${D1}`)));
  await assertFails(getDocs(collection(db.t1, `classes/${C}/pace`)));
  await assertSucceeds(getDoc(doc(db.admin, `classes/${C}/pace/${D1}`)));
  await assertFails(getDoc(doc(db.t2, `classes/${C}/pace/${D1}`)));
  await assertFails(getDoc(doc(db.s1, `classes/${C}/pace/${D1}`)));
});

test("pace: teachers cannot vote or reset totals", async () => {
  await assertFails(vote(db.t1, "t1", D1, "easy", false));
  await vote(db.s1, "s1", D1, "easy", false);
  await assertFails(setDoc(doc(db.t1, `classes/${C}/pace/${D1}`), { easy: 0, right: 0, hard: 0, n: 0 }));
  await assertFails(deleteDoc(doc(db.admin, `classes/${C}/pace/${D1}`)));
});

// ---------- Findings from the independent checker (CHECKS.md) ----------

test("timestamps must be server time: no back-dated help requests", async () => {
  await assertFails(setDoc(doc(db.s1, `classes/${C}/help/old`), help("s1", { createdAt: new Date("2020-01-01") })));
  await assertFails(setDoc(doc(db.s1, `classes/${C}/submissions/s1_p1`), sub("s1", { updatedAt: new Date("2020-01-01") })));
  await assertFails(updateDoc(doc(db.t1, `classes/${C}/help/h1`), { status: "answered", answer: "x", answeredBy: "t1", answeredByName: "t1", answeredAt: new Date("2020-01-01") }));
});

test("names in answers and history must be the writer's own", async () => {
  await assertFails(updateDoc(doc(db.t1, `classes/${C}/help/h1`), { status: "answered", answer: "x", answeredBy: "t1", answeredByName: "Mr Ariel", answeredAt: NOW }));
  const t1 = db.t1;
  const b = writeBatch(t1);
  b.set(doc(t1, `classes/${C}/sessions/${D2}`), { date: D2, status: "submitted", marks: {}, rev: 1, deleted: false, updatedAt: NOW, updatedBy: "t1" });
  b.set(doc(t1, `classes/${C}/sessions/${D2}/history/1`), { rev: 1, at: NOW, by: "t1", byName: "Mr Ariel", status: "submitted", marks: {}, deleted: false });
  await assertFails(b.commit());
});

test("attendance marks are only present or absent", async () => {
  await assertFails(sessionBatch(db.t1, D2, 1, { marks: { s1: "banana" } }).commit());
});

test("pace: no voting on an older session or a deleted one", async () => {
  await assertSucceeds(sessionBatch(db.t1, D2, 1, { closeVoting: true }).commit());
  await assertFails(vote(db.s1, "s1", D1, "easy", false));   // no longer the latest
  await assertSucceeds(sessionBatch(db.t1, D2, 2, { deleted: true }).commit());
  await assertFails(vote(db.s1, "s1", D2, "easy", false));   // deleted
});

test("teachers cannot pin arbitrary versions, set junk join codes, or move the pace window back", async () => {
  await assertFails(updateDoc(doc(db.t1, "classes", C), { pointer: { levelId: "l9", topicId: "x" }, "pins.l9": 999 }));
  await assertFails(updateDoc(doc(db.t1, "classes", C), { "pins.l9": 1 }));   // pin without moving the pointer there
  await assertFails(updateDoc(doc(db.t1, "classes", C), { joinCode: "not a code" }));
  await assertFails(updateDoc(doc(db.t1, "classes", C), { lastSubmittedSession: "2026-07-01" }));
});

test("a teacher cannot join their own class as a student", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "joinCodes/ABCDEF"), { classId: C, className: "Python A" }));
  await assertFails(setDoc(doc(db.t1, `classes/${C}/members/t1`), { uid: "t1", name: "t1", email: people.t1.email, code: "ABCDEF", className: "Python A", status: "pending", requestedAt: NOW }));
});

// ---------- Findings from the independent checker, round 2 ----------

test("nobody, not even an admin, can move the pace window back or to a session that does not exist", async () => {
  await assertSucceeds(sessionBatch(db.t1, D2, 1, { closeVoting: true }).commit());
  await assertFails(updateDoc(doc(db.admin, "classes", C), { lastSubmittedSession: D1 }));   // backwards
  await assertFails(updateDoc(doc(db.t1, "classes", C), { lastSubmittedSession: D3 }));      // no session on D3
  await assertFails(updateDoc(doc(db.t1, "classes", C), { lastSubmittedSession: "9999-99-99" }));
  await assertFails(updateDoc(doc(db.admin, "classes", C), { lastSubmittedSession: D3 }));
});

test("attendance cannot be recorded for a future date", async () => {
  await assertFails(sessionBatch(db.t1, addDays(today(), 3), 1).commit());
});

test("pace voting closes after 7 days, and the totals then become readable", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, `classes/${C}/sessions/${OLD}`), { date: OLD, status: "submitted", marks: {}, rev: 1, deleted: false, updatedAt: 1, updatedBy: "t1" });
    await setDoc(doc(f, `classes/${C}/pace/${OLD}`), { easy: 1, right: 3, hard: 1, n: 5 });
    await updateDoc(doc(f, "classes", C), { lastSubmittedSession: OLD });
  });
  await assertFails(vote(db.s1, "s1", OLD, "easy", true));
  await assertSucceeds(getDoc(doc(db.t1, `classes/${C}/pace/${OLD}`)));
});

test("names on student writes must be the student's own; staff cannot rename themselves", async () => {
  await assertFails(setDoc(doc(db.s1, `classes/${C}/help/spoof`), help("s1", { name: "s2" })));
  await assertFails(setDoc(doc(db.s1, `classes/${C}/submissions/s1_p1`), sub("s1", { name: "s2" })));
  await assertFails(updateDoc(doc(db.t1, "users/t1"), { name: "Ms Principal" }));
  await assertSucceeds(updateDoc(doc(db.s1, "users/s1"), { name: "Ana B." }));
});

test("a project's creation time cannot be rewritten", async () => {
  await assertFails(updateDoc(doc(db.t1, `classes/${C}/projects/p1`), { createdAt: new Date("2020-01-01") }));
  await assertSucceeds(updateDoc(doc(db.t1, `classes/${C}/projects/p1`), { deleted: true }));
});

// ---------- Findings from the independent checker, round 3 ----------

test("only real students vote: not allowlisted outside accounts, not the class's teachers", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, "config/access"), { extraEmails: ["stjbscodingclub@gmail.com", "fake1@gmail.com"] });
    await setDoc(doc(f, "users/fake1"), { email: "fake1@gmail.com", name: "fake1", role: "student", classIds: [], createdAt: 1 });
    await setDoc(doc(f, `classes/${C}/members/fake1`), { uid: "fake1", name: "fake1", email: "fake1@gmail.com", code: "ABCDEF", className: "x", status: "approved", requestedAt: 1 });
    await setDoc(doc(f, `classes/${C}/members/t1`), { uid: "t1", name: "t1", email: people.t1.email, code: "ABCDEF", className: "x", status: "approved", requestedAt: 1 });
  });
  const fake = env.authenticatedContext("fake1", token("fake1@gmail.com")).firestore();
  await assertFails(vote(fake, "fake1", D1, "easy", false));
  await assertFails(vote(db.t1, "t1", D1, "easy", false));
  await assertSucceeds(vote(db.s1, "s1", D1, "easy", false));
});

test("attendance for tomorrow (Jakarta) is refused; today is allowed", async () => {
  await assertFails(sessionBatch(db.t1, addDays(today(), 1), 1).commit());
  await assertSucceeds(sessionBatch(db.t1, today(), 1).commit());
});

test("names cannot be empty; help requests carry the writer's real email", async () => {
  await assertFails(updateDoc(doc(db.s1, "users/s1"), { name: "" }));
  await assertFails(setDoc(doc(db.s1, `classes/${C}/help/h9`), help("s1", { email: people.s2.email })));
});

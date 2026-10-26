// Every Firestore read and write in the app lives here, grouped by feature.
// Pages call these functions; they never talk to Firestore directly.
// Each function says who is allowed to call it; firestore.rules is what actually enforces it.
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where,
  writeBatch, increment, arrayUnion, serverTimestamp,
} from "firebase/firestore/lite";
import { db } from "./firebase.js";
import { PACE_MIN_RESPONSES } from "./config.js";

const one = async (path) => {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};
const many = async (q) => (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
const col = (path) => collection(db, path);

// ---------- Profile ----------

export const getProfile = (uid) => one(`users/${uid}`);

export async function createProfile(user) {
  const profile = { email: user.email.toLowerCase(), name: user.displayName || user.email, role: "student", classIds: [], createdAt: serverTimestamp() };
  await setDoc(doc(db, "users", user.uid), profile);
  return { id: user.uid, ...profile };
}

export const updateName = (uid, name) => updateDoc(doc(db, "users", uid), { name });

// Admin only.
export const listUsers = () => many(col("users"));
export const setRole = (uid, role) => updateDoc(doc(db, "users", uid), { role });
export const getAccess = () => one("config/access");
export const setAccess = (extraEmails) => setDoc(doc(db, "config/access"), { extraEmails });

// ---------- Classes ----------

export const getClass = (id) => one(`classes/${id}`);

// Staff: the classes I teach. Admin: every class.
export const listMyTeaching = (uid) => many(query(col("classes"), where("teacherIds", "array-contains", uid)));
export const listAllClasses = () => many(col("classes"));

// Classes a student has asked to join, with their membership status.
export async function listMyMemberships(me) {
  const out = [];
  for (const cid of me.classIds || []) {
    const m = await one(`classes/${cid}/members/${me.id}`);
    if (!m) continue;
    out.push({ classId: cid, member: m, cls: m.status === "approved" ? await getClass(cid) : null });
  }
  return out;
}

// Join codes avoid look-alike characters (no I, O, 0, 1).
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newJoinCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}

// Admin: create a class (and its join code) in one batch.
export async function createClass(data) {
  const ref = doc(col("classes"));
  const joinCode = newJoinCode();
  const b = writeBatch(db);
  b.set(ref, { ...data, joinCode, pointer: null, pins: {}, lastSubmittedSession: "", archived: false, createdAt: serverTimestamp() });
  b.set(doc(db, "joinCodes", joinCode), { classId: ref.id, className: data.name });
  await b.commit();
  return ref.id;
}

// Admin: edit name, teachers, schedule, term dates, archive.
export const updateClass = (id, fields) => updateDoc(doc(db, "classes", id), fields);

// Teacher or admin: replace the join code (the old one stops working).
export async function replaceJoinCode(cls) {
  const code = newJoinCode();
  const old = (await getClass(cls.id)).joinCode;   // fresh: another tab may have changed it
  const b = writeBatch(db);
  b.update(doc(db, "classes", cls.id), { joinCode: code });
  b.set(doc(db, "joinCodes", code), { classId: cls.id, className: cls.name });
  if (old) b.delete(doc(db, "joinCodes", old));
  await b.commit();
  return code;
}

// Teacher: set the "we are on this topic" pointer. The first time a class reaches a
// level, that level is pinned to the current latest curriculum version, for good.
export async function setPointer(cls, levelId, topicId, latest) {
  const fields = { pointer: { levelId, topicId } };
  if (cls.pins?.[levelId] === undefined) fields[`pins.${levelId}`] = latest;
  await updateDoc(doc(db, "classes", cls.id), fields);
}

export const setDefaultPresent = (cid, value) => updateDoc(doc(db, "classes", cid), { defaultPresent: value });

// ---------- Joining ----------

export const lookupJoinCode = (code) => one(`joinCodes/${code}`);

// Student: ask to join. Re-asks if a teacher rejected or removed them before.
export async function requestToJoin(me, code) {
  const jc = await lookupJoinCode(code);
  if (!jc) throw new Error("No class has that code. Check it with your teacher.");
  const ref = doc(db, `classes/${jc.classId}/members/${me.id}`);
  const existing = await one(ref.path);
  if (existing?.status === "approved") throw new Error(`You are already in ${jc.className}.`);
  if (existing?.status === "pending") throw new Error(`You have already asked to join ${jc.className}. Your teacher will approve you.`);
  if (existing) await updateDoc(ref, { status: "pending", code, requestedAt: serverTimestamp() });
  else await setDoc(ref, { uid: me.id, name: me.name, email: me.email, code, className: jc.className, status: "pending", requestedAt: serverTimestamp() });
  await updateDoc(doc(db, "users", me.id), { classIds: arrayUnion(jc.classId) });
  return jc;
}

// Teacher: everyone in the class, any status.
export const listMembers = (cid) => many(col(`classes/${cid}/members`));

export const decideMember = (cid, uid, status, me) =>
  updateDoc(doc(db, `classes/${cid}/members/${uid}`), { status, decidedAt: serverTimestamp(), decidedBy: me.id });

// ---------- Weekly projects ----------

export async function listProjects(cid) {
  const all = await many(col(`classes/${cid}/projects`));
  return all.filter((p) => !p.deleted).sort((a, b) => (a.week < b.week ? 1 : -1));
}

export const getProject = (cid, pid) => one(`classes/${cid}/projects/${pid}`);

export async function createProject(cid, me, { title, week, topicId, options }) {
  const ref = doc(col(`classes/${cid}/projects`));
  await setDoc(ref, { title, week, topicId, options, createdAt: serverTimestamp(), createdBy: me.id, deleted: false });
  return ref.id;
}

export const removeProject = (cid, pid) => updateDoc(doc(db, `classes/${cid}/projects/${pid}`), { deleted: true });

// ---------- Submissions ----------

const subId = (uid, pid) => `${uid}_${pid}`;
export const getMySubmission = (cid, pid, uid) => one(`classes/${cid}/submissions/${subId(uid, pid)}`);
export const listMySubmissions = (cid, uid) => many(query(col(`classes/${cid}/submissions`), where("uid", "==", uid)));
export const listSubmissions = (cid, pid) =>
  many(pid ? query(col(`classes/${cid}/submissions`), where("projectId", "==", pid)) : col(`classes/${cid}/submissions`));

// Student: save work. When askForHelp is true (status "needs help" and no request
// already open), a help request with the code and the last error is created in the same batch.
export async function saveSubmission(cid, project, me, { optionId, code, scratchUrl, status, lastError, note, askForHelp }) {
  const b = writeBatch(db);
  b.set(doc(db, `classes/${cid}/submissions/${subId(me.id, project.id)}`), {
    uid: me.id, name: me.name, projectId: project.id, optionId, code, scratchUrl, status, lastError, updatedAt: serverTimestamp(),
  });
  if (askForHelp) {
    b.set(doc(col(`classes/${cid}/help`)), {
      uid: me.id, name: me.name, projectId: project.id, projectTitle: project.title,
      code, scratchUrl, error: lastError, note: note || "", status: "open", createdAt: serverTimestamp(),
    });
  }
  await b.commit();
}

// ---------- Help requests ----------

// Teacher: open requests, longest waiting first.
export async function listOpenHelp(cid) {
  const open = await many(query(col(`classes/${cid}/help`), where("status", "==", "open")));
  return open.sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}

export const listAllHelp = (cid) => many(col(`classes/${cid}/help`));
export const listMyHelp = (cid, uid) => many(query(col(`classes/${cid}/help`), where("uid", "==", uid)));

export const answerHelp = (cid, hid, me, answer) =>
  updateDoc(doc(db, `classes/${cid}/help/${hid}`), { status: "answered", answer, answeredBy: me.id, answeredByName: me.name, answeredAt: serverTimestamp() });

export const closeHelp = (cid, hid) => updateDoc(doc(db, `classes/${cid}/help/${hid}`), { status: "closed", closedAt: serverTimestamp() });

// ---------- Attendance ----------

export const listSessions = (cid) => many(col(`classes/${cid}/sessions`));
export const listSessionHistory = (cid, date) => many(col(`classes/${cid}/sessions/${date}/history`));

// Teacher: write a session and its history entry together (rules require both).
// status: "submitted" | "cancelled". deleted: soft delete.
export async function saveSession(cls, date, me, { status, marks, deleted = false }, previousRev = 0) {
  const rev = previousRev + 1;
  const b = writeBatch(db);
  b.set(doc(db, `classes/${cls.id}/sessions/${date}`), { date, status, marks, rev, deleted, updatedAt: serverTimestamp(), updatedBy: me.id });
  b.set(doc(db, `classes/${cls.id}/sessions/${date}/history/${rev}`), { rev, at: serverTimestamp(), by: me.id, byName: me.name, status, marks, deleted });
  // Students may give pace feedback for the most recent submitted session.
  if (status === "submitted" && !deleted && date >= (cls.lastSubmittedSession || "")) {
    b.update(doc(db, "classes", cls.id), { lastSubmittedSession: date });
  }
  await b.commit();
}

// ---------- Pace feedback ----------

export async function hasVoted(cid, date, uid) {
  return (await getDoc(doc(db, `classes/${cid}/pace/${date}/voters/${uid}`))).exists();
}

// Student: one anonymous vote. choice: "easy" | "right" | "hard".
// Students cannot read the totals, so we cannot know whether this is the first vote:
// try adding to existing totals, and if there are none yet, create them.
export async function vote(cid, date, uid, choice) {
  const pace = doc(db, `classes/${cid}/pace/${date}`);
  const voter = doc(db, `classes/${cid}/pace/${date}/voters/${uid}`);
  const attempt = (create) => {
    const b = writeBatch(db);
    if (create) b.set(pace, { easy: 0, right: 0, hard: 0, n: 1, [choice]: 1 });
    else b.update(pace, { [choice]: increment(1), n: increment(1) });
    b.set(voter, {});
    return b.commit();
  };
  // Students cannot read totals, so try "update" first and fall back to "create".
  try { await attempt(false); } catch { await attempt(true); }
}

// Teacher or admin: totals for sessions whose voting has closed (a later session was
// submitted) and that have enough answers. The rules refuse every other totals document,
// so each one is fetched on its own and refusals are skipped.
export async function listPace(cls, sessions) {
  const dates = sessions.filter((s) => s.status === "submitted" && !s.deleted && s.date < (cls.lastSubmittedSession || "")).map((s) => s.date);
  const found = await Promise.all(dates.map((d) => one(`classes/${cls.id}/pace/${d}`).catch(() => null)));
  return found.filter((p) => p && p.n >= PACE_MIN_RESPONSES);
}

// ---------- Curriculum ----------

const versionCache = new Map();   // versions never change except errata, so keep them for the visit

export const getCurriculumConfig = async () => (await one("config/curriculum")) || { latest: 0, maxVersion: 0 };

export async function getVersion(v, { fresh = false } = {}) {
  if (!fresh && versionCache.has(v)) return versionCache.get(v);
  const d = await one(`curriculumVersions/${v}`);
  if (d) versionCache.set(v, d);
  return d;
}

// Loads the latest version plus any versions a class has pinned. Returns { latest, versions }.
export async function loadCurriculum(pins = {}) {
  const { latest } = await getCurriculumConfig();
  const needed = new Set([latest, ...Object.values(pins)].filter(Boolean));
  const versions = {};
  for (const v of needed) versions[v] = (await getVersion(v))?.data;
  return { latest, versions };
}

// Admin: publish a new version and make it the latest.
export async function publishVersion(data, notes, me, maxVersion) {
  const v = maxVersion + 1;
  const b = writeBatch(db);
  b.set(doc(db, "curriculumVersions", String(v)), { version: v, data, notes, publishedAt: serverTimestamp(), publishedBy: me.email, errata: [] });
  b.set(doc(db, "config/curriculum"), { latest: v, maxVersion: v });
  await b.commit();
  versionCache.delete(v);
  return v;
}

// Admin: point "latest" at an older (or newer) existing version.
export const setLatest = (v, maxVersion) => setDoc(doc(db, "config/curriculum"), { latest: v, maxVersion });

// Admin: fix typos or links inside an existing version.
export async function applyErrata(v, data, note, me) {
  const current = await getVersion(v, { fresh: true });
  await updateDoc(doc(db, "curriculumVersions", String(v)), {
    data, errata: [...(current.errata || []), { at: Date.now(), by: me.email, note }],
  });
  versionCache.delete(v);
}

export async function listVersions(maxVersion) {
  const out = [];
  for (let v = maxVersion; v >= 1; v--) out.push(await getVersion(v));
  return out.filter(Boolean);
}

// ---------- Export ----------

export const getExportInfo = () => one("config/export");
export const markExported = (me) => setDoc(doc(db, "config/export"), { lastExportAt: serverTimestamp(), by: me.email });

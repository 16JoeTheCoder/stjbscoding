# Architecture

One static web app (HTML, CSS, JavaScript) on Cloudflare, talking directly to Firebase Auth and Firestore from the browser. No server code anywhere. Security is `firestore.rules`.

```
Browser (Chrome on Chromebooks and Windows laptops)
  ├─ index.html + JS bundle (Vite build, from Cloudflare)
  ├─ Python runtime (Pyodide, /pyodide/, from Cloudflare, loaded on first Run, runs in a Web Worker)
  ├─ Firebase Auth  ── Google sign-in popup
  └─ Firestore (lite SDK) ── every read/write checked by firestore.rules
```

## Code map

| Path | What it is |
| --- | --- |
| `src/main.js` | Sign-in screen, profile creation, route table (which page, which roles). |
| `src/router.js` | Hash router. A page is `async (ctx) => () => html\`...\``: load data, return a render function. |
| `src/data.js` | Every Firestore read and write, grouped by feature. Start here to understand the data. |
| `src/load.js` | Bundles of reads several pages share (one class for staff, a class's curriculum). |
| `src/pages/*.js` | One file per screen. `class.js` holds the teacher tabs (roster, curriculum pointer, projects, help, attendance, pace). |
| `src/curriculum.js` | Curriculum validation, frozen-level check, errata check, "which version does this class see". Pure functions. |
| `src/python/` | `runner.js` (page side, queue and timeout), `worker.js` (owns Pyodide), `core.js` (runs one program; shared with Node tests). |
| `src/editor.js` | The code box: textarea, Run, Reset, Input box, output. |
| `src/time.js` | Asia/Jakarta dates, schedules, "which sessions have ended". |
| `src/ui.js`, `src/styles.css` | Layout pieces and styles built from the design system in `src/design/` (copied, never edited). |
| `src/config.js` | The few numbers you might want to change. |
| `firestore.rules` | Security. Tested by `tests/rules/`. |
| `curriculum/` | The curriculum file, its schema (editor hints) and the sample content. |
| `scripts/` | Pyodide copy, build output check, emulator seed, design sync, design lint. |

## Data model (Firestore)

```
users/{uid}                     email, name, role (student|teacher|admin), classIds[] (shortcut list)
config/access                   extraEmails[]  (non-school Google accounts allowed to sign in)
config/curriculum               latest, maxVersion
config/export                   lastExportAt, by
curriculumVersions/{n}          version, data (whole curriculum file), notes, errata[]
joinCodes/{CODE}                classId, className
classes/{cid}                   name, track (python|scratch), teacherIds[], teacherNames{}, schedule[{weekday,start,minutes}],
                                termStart, termEnd, joinCode, defaultPresent, pointer{levelId,topicId}, pins{levelId: version},
                                lastSubmittedSession, archived
  members/{uid}                 uid, name, email, code, className, status (pending|approved|rejected|removed)
  projects/{pid}                title, week (Monday), topicId, options[{id,title,brief,starter}], deleted
  submissions/{uid}_{pid}       uid, name, projectId, optionId, code, scratchUrl, status (in_progress|done|needs_help), lastError
  help/{hid}                    uid, name, projectId, projectTitle, code, scratchUrl, error, note, status (open|answered|closed), answer...
  sessions/{YYYY-MM-DD}         status (submitted|cancelled), marks{uid: present|absent}, rev, deleted
    history/{rev}               copy of the session as written, by, byName, at
  pace/{YYYY-MM-DD}             easy, right, hard, n          (totals only; readable when n >= 5)
    voters/{uid}                {}                            (empty; stops double votes; unreadable by staff)
```

Who can read what (enforced in `firestore.rules`, tested in `tests/rules/rules.test.js`):

| | Student (approved in class) | Teacher of the class | Other teacher | Admin |
| --- | --- | --- | --- | --- |
| class document | read | read, edit pointer/pins/default/join code | no | read, write |
| members | own document only | read, approve/reject/remove | no | read |
| projects | read | read, write | no | read |
| submissions | own only, write own | read | no | read |
| help | own only, create, close own | read, answer | no | read |
| sessions + history | no | read, write (with history) | no | read |
| pace totals | no | read if n >= 5 | no | read if n >= 5 |
| pace voters | own "I voted" marker | no | no | no |

## Main flows

- **Sign-in.** Google popup → the app reads `users/{uid}`, or creates it as a student. If the rules refuse (not a school account and not on the allowlist), the app signs out and says so.
- **Join.** Student types a code → `joinCodes/{code}` gives the class → student creates `members/{uid}` as pending (rules check the code belongs to that class) → teacher approves.
- **Weekly project.** Teacher posts a project for a week from a curriculum topic → student picks an option, writes code, runs it, sets a status → "Needs help" saves the submission and a help request (code + last error) in one batch → teacher's queue is oldest first → teacher answers → student sees the answer on This week.
- **Attendance.** Expected sessions come from the schedule and term dates (`time.js`). A session that has ended without a document is "not submitted" and shows on the admin's monitoring page. Teacher opens it, everyone starts as the class default, teacher flips exceptions, presses Submit. Every save writes `history/{rev}`.
- **Pace.** After Submit, `classes/{cid}.lastSubmittedSession` points at that date. Students get one tap for up to 7 days; the vote only increments totals. Totals become visible to the teacher only after voting closes (next session submitted, or 7 days) and only with 5 or more answers.
- **Curriculum.** Admin uploads a file → validated → frozen-level check (against every class's pins) → every snippet runs in the browser → preview of what changes → publish as a new version. Errata go into an existing version if only text changed. "Make latest" rolls back or forward. A class pins a level to the latest version when its teacher first sets the pointer in that level.
- **Export.** Admin presses a button → the browser reads every class's records and downloads JSON or CSV → `config/export.lastExportAt` is updated → banners stop.

## Reads per day (Spark free quota: 50 000 reads, 20 000 writes)

Rough costs per page load (each security-rule `get()` also counts as a read):
student This week about 10 to 20; teacher This week about 60 to 100 per class (members, sessions, open help, projects); admin monitoring about 100 per class; one full export a few thousand. With 30 people each loading 20 pages on a school day, that is roughly 10 000 to 20 000 reads, well inside the quota. Writes are a few hundred a day. Check Firebase console > Firestore > Usage after the first weeks. If reads ever approach the limit, the first thing to trim is the sessions list on the teacher's This week (load it only on the Attendance tab).

## Seams for later (not built)

- Forum, chat, email: none. A new feature gets its own subcollection under `classes/{cid}` and its own block in `firestore.rules` with tests.
- Streaks or practice mode: would read `submissions`; no schema change needed to start.
- A better editor: replace the textarea in `src/editor.js` only.
- More tracks: add an id to `TRACK_IDS` in `src/curriculum.js`, the `track in [...]` check in `firestore.rules`, and the schema.

# Checks

What was verified before handover, how, and what was found. Re-run everything with the commands at the bottom.

## Status

| Area | Result | Evidence |
| --- | --- | --- |
| Security rules | **VERIFIED with the Firebase emulator** | `npm run test:rules`: 41 tests, every role against every collection, all passing. Plus the checker's own 95 adversarial rule checks (round 1). |
| Broken flows | Verified in a real browser | `npm run test:e2e`: 15 flows in Chromium, against the Auth and Firestore emulators, under the production CSP. |
| Python runtime | Verified | Unit tests run every curriculum snippet through the same code as the browser worker; e2e runs Python in Chromium under the CSP, including an infinite loop being stopped. |
| Deploy readiness | Verified, except the real Google popup | `npm run build` passes `scripts/check-dist.js`. The popup cannot be tested here (see Not verified). |
| Bloat | Checked | Main bundle 86.8 KB gzip, CSS 5.1 KB, admin pages 1.3 to 2.7 KB each (lazy), worker 0.8 KB. 3 runtime dependencies. |
| Design compliance | Checked | `npm run design:check` (design-system lint plus template lint) clean. The e2e test confirms the logo appears only in the Settings credit. |

## Test suites (last run on the final commit)

| Command | Result |
| --- | --- |
| `npm test` | 23 passed, 0 failed (curriculum validation, frozen levels, errata, rollback, Jakarta dates, CSV, Python runner, all 10 sample snippets) |
| `npm run test:rules` | 41 passed, 0 failed |
| `npm run test:e2e` | 15 passed, 0 failed |
| `npm run build` | `ok dist: 22 files`; largest file `pyodide/pyodide.asm.wasm` 9.6 MB (limit 25 MiB) |
| `npm run design:check` | `ok builtbyjosef check clean`, `ok templates clean` |

### What the end-to-end flows cover

1. An outsider Gmail account is turned away. 2. The allowlisted club account signs in. 3. Join: a wrong code gives an error; the right code (typed in lowercase) creates a request; the teacher approves; the student sees the class. 4. A student cannot open admin pages or another class. 5. Submit a project: pick an option, run Python, mark done; the teacher sees "Done". 6. Help: a run error, "Needs help" with a note; the teacher's queue lists the oldest request first and shows the error; the teacher answers; the student sees the answer. 7. An infinite loop is stopped after 5 s and Python works again. 8. Attendance: the flagged session shows on admin monitoring; the teacher marks an exception and submits; the history shows "Edit 1"; the admin flag clears. 9. Pace: a student answers once and cannot answer again; the teacher sees only the closed session with 5 answers. 10. Curriculum: a frozen-level change is rejected; a valid file's 11 snippets run and the broken one is reported; it publishes as version 2; an erratum that changes code is refused; a title fix is accepted; the class still sees version 1 of its pinned level and the new level 4. 11. Export: JSON has every dataset; CSV has the right header; the warning banner clears. 12. The logo appears only in Settings. 13. A 5 000-character error still saves with "Needs help". 14. Editing old attendance keeps a student who has since been removed. 15. No console errors or CSP violations during the whole run.

## Independent checker, round 1

A separate agent with no knowledge of the build reasoning was briefed to find faults in the five areas. It found 19 issues. Every one was fixed, or accepted with the reason given.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| C1 | major | A teacher could learn how one named student voted on pace: remove everyone else, read totals before and after the vote, re-admit. | **Fixed.** Voting is open only for the latest submitted session. Totals are readable only after voting closes, and `lastSubmittedSession` can only move forward. Rules test "nobody can see who voted" now checks that totals stay hidden while voting is open, even at 5 or more votes. DECISIONS D19 was corrected. |
| C2 | major | A student could back-date `createdAt` on a help request to jump the queue. | **Fixed.** Every timestamp a user writes must equal `request.time`. New rules test. |
| C3 | major | Editing old attendance rebuilt the marks from today's roster: removed students lost their mark, and students who joined later got the default. | **Fixed.** Editing starts from the recorded marks. Students approved after the date are left blank. New e2e test. |
| C4 | major | A long error message (over 4 000 characters) made "Needs help" fail with a misleading message. | **Fixed.** The error and note are cut to the database limits, code that is too long gets a clear message, and the old "Saved" notice is cleared. New e2e test. |
| C5 | minor | A teacher could pin any version number, set a junk join code, or move `lastSubmittedSession` anywhere. | **Fixed.** A teacher can only add the pin for the level the pointer moves into, set to the latest version. The join code must match the format. `lastSubmittedSession` only moves forward. Admins may still correct pins (trusted, D20). New rules test. |
| C6 | minor | A teacher could join their own class as a student. | **Fixed** in the rules. New rules test. |
| C7 | minor | Votes on deleted sessions, attendance marks like "banana", spoofed `byName` and `answeredByName` were all allowed. | **Fixed** in the rules, with tests. **Accepted:** `optionId` is not checked against the project's options (it only affects the student's own submission); attendance dates are not checked against the schedule (only the class's own teacher can write them, and every write is in the history); duplicate open help requests are prevented by the app, not the rules (D25). |
| C8 | minor | "New code" and "Default to ..." failed silently, and a stale tab could not replace the join code. | **Fixed.** Errors now show on the page, and the code replacement re-reads the current code first. |
| C9 | minor | If Python's download stalled, Run stayed stuck until reload. | **Fixed.** A 180 s load timeout and a worker error handler now reset the runtime. |
| C10 | minor | After voting, a later session's pace question stayed hidden until reload. | **Fixed.** The widget state is now kept per session date. |
| C11 | minor | Two tabs could create duplicate help requests. The `vote()` comment was wrong. | **Fixed.** The app re-reads the student's requests before asking for help, and the comment is corrected. |
| C12 | minor | Rollback was refused when a class had pinned a level that only exists in the newer version. | **Fixed** (`allowMissing` for rollback), with a unit test. |
| C13 | minor | Downloading any single CSV reset the export reminder. | **Fixed.** Only the full JSON export resets it. |
| C14 | major | CHECKS.md did not exist. | **Fixed:** this file. |
| C15 | minor | DEPLOY.md did not mention preview domains, and an unused `.firebaserc.example` was in the repo. | **Fixed.** A preview-domain note was added and the file removed. |
| C16 | nit | Emulator code (`connectAuthEmulator`, `127.0.0.1`, `demo-key`) shipped in the production bundle. | **Fixed.** Env variables are read by full name so Vite removes that code; grep of `dist/` confirms. |
| C17 | minor | The join code rendered small because a design-system selector won. | **Fixed** with a more specific selector. |
| C18 | minor | The design lint skipped `.js` templates. Stat rows put several orange caps on one view. 32 px buttons were below the 44 px target. | **Fixed.** `scripts/check-templates.js` lints the templates. Stats were replaced with plain sentences. All buttons and choices are 44 px. |
| C19 | nit | There was unused code (`stat()`, `.row--end`, an export). A dynamic import had no effect. Pages read whole subcollections. | **Fixed:** the unused code was removed and the import is now static. **Accepted:** whole-subcollection reads stay. They are per class, bounded by one class's term (about 25 members, 40 sessions, 10 projects), happen only on demand, and stay far inside the free quota at 50 users (ARCHITECTURE.md, Reads per day). The brief's concern is unbounded listeners and loading whole top-level collections on page load; there are no listeners at all, and the only top-level collection listed is `classes`, by admins. |

## Independent checker, round 2

See the section added below once round 2 has run.

## Not verified here (founder to check after deploying)

- **The real Google sign-in popup.** This sandbox blocks `apis.google.com`, so the popup could not be opened, in dev or in tests. Tests sign in through the emulator with the same Google credential type (`signInWithCredential`). After deploying, check this: sign in on the live site with a school account; sign in with a non-school Gmail and confirm it is refused; check the browser console (F12) for CSP errors during sign-in. If the CSP blocks something, the console names the host; add it to the matching directive in `public/_headers`.
- **Cloudflare itself.** `_headers` follows the Pages and Workers static-assets format, and the e2e server applies the same file, but no deploy to Cloudflare happened from here (no account access, by design).
- **Speed on a real slow Chromebook.** The first Python run downloads about 13 MB (about 3.5 MB of it is the compressed wasm). Later runs come from the browser cache.

## How to re-run

VS Code terminal, in the repository (Java 21 is needed for the emulator; Playwright with Chromium for e2e):

```
npm ci
npm test
npm run test:rules
npm run test:e2e
npm run build
npm run design:check
```

# Decisions

Every choice that shapes this repo, with what was considered and what it costs. Newest at the bottom of each section. If you change one, add a line saying why rather than deleting the old reasoning.

## Fixed by the founder (recorded, not revisited)

**D1. Host on Cloudflare as plain static files.** Alternatives: Netlify, Firebase Hosting, GitHub Pages. Reason: Cloudflare serves static requests free and without limit, with no card on file. Netlify's free tier is a hard credit cap (a deploy costs 15 of 300 monthly credits; when they run out every project on the account pauses), which is the wrong failure mode for a school. Firebase Hosting is excluded to keep Firebase on the Spark plan with only Auth and Firestore in use. Tradeoff: no server code at all, so every rule lives in Firestore security rules.

**D2. Firebase Spark plan (Google Auth + Firestore) as the only backend.** Alternatives: Supabase (free projects pause after a week of inactivity, which would happen every school holiday), Cloudflare D1 + Workers (no built-in auth, so security would be hand-written code). Reason: Google sign-in is built in and the school runs on Google accounts; Firestore rules give declarative, testable security. Tradeoff: the Spark free quota (50 000 reads, 20 000 writes per day) caps usage; at 50 users this is far away (see ARCHITECTURE.md, "Reads per day").

**D3. Zero cost, no billing, ever.** No Cloud Functions, no Workers/Pages Functions, no Cloud Storage, no paid APIs, no AI. Consequence: anything that would normally be a server job (counting votes, checking a join code, flagging late attendance) is done either by security rules or by the client of the person who needs to see it.

## Stack

**D4. Vite + plain JavaScript + lit-html. No framework.** Alternatives: React (45 KB, JSX, hooks, a build step anyway), Preact + htm (small, but still a component/hook model to learn), Svelte (compiler, own syntax), plain `innerHTML` strings (no dependency, but every student name or code snippet becomes an XSS hole unless escaped by hand). Reason: lit-html is one function, `html\`...\``, that escapes everything by default and updates the page efficiently. Pages are plain async functions. A Sec 4 student who knows HTML and a little JavaScript can read any page file top to bottom. Tradeoff: no component library or state manager; pages re-render themselves by calling `rerender()`. At this size that is a feature.

**D5. Vite as the only build tool.** Alternatives: no build at all (Firebase's SDK must then come from a CDN, which the CSP and "self-host everything" goal argue against), esbuild directly (fine, but Vite adds a dev server with hot reload for free). Reason: one config-free tool that bundles, tree-shakes Firebase and hashes file names for caching. Tradeoff: one dev dependency with its own sub-dependencies.

**D6. `firebase/firestore/lite` instead of the full Firestore SDK.** Alternatives: full SDK (realtime listeners, offline cache, about three times the size). Reason: the brief rules out unbounded listeners, and every screen here loads on demand. Lite has no listeners, so nobody can add one by accident, and it is much smaller on slow Chromebooks. Tradeoff: no offline mode and no live updates; a teacher presses Refresh (or navigates) to see new help requests.

**D7. Pyodide (CPython compiled to WebAssembly) for the Run button, self-hosted.** Alternatives: Skulpt or Brython (smaller, but not real CPython, so error messages and behaviour differ from Thonny), a server sandbox (costs money). No founder's compiler exists in the repo, so per the brief Pyodide is used. Reason: real Python 3, the same errors students see in Thonny. Files are copied from `node_modules/pyodide` into the build by `scripts/copy-pyodide.js`, which fails the build if any file exceeds Cloudflare's 25 MiB per-file limit (the largest, `pyodide.asm.wasm`, is about 9.2 MB). Tradeoff: about 13 MB downloaded on the first Run, then cached by the browser; nothing loads until someone presses Run.

**D8. Python runs in a Web Worker that is killed on timeout.** Alternatives: run on the main thread (an infinite loop freezes the tab), SharedArrayBuffer interrupts (need COOP/COEP headers, and `Cross-Origin-Opener-Policy: same-origin` breaks the Google sign-in popup). Reason: `worker.terminate()` always works. Tradeoff: after a timeout the next Run reloads Python (a few seconds, from the browser cache).

**D9. Code editor is a `<textarea>` with Tab and auto-indent.** Alternatives: CodeMirror 6 (about 150 KB, syntax colouring), Monaco (megabytes). Reason: students write real code in Thonny; the site editor is for short weekly projects and trying snippets. Twenty lines of key handling give Tab, Shift+Tab and keep-indent-on-Enter. Tradeoff: no syntax colouring. Seam: `src/editor.js` is the only place to swap in CodeMirror later.

**D10. Hash routing (`/#/class/abc`).** Alternatives: History API routes plus a server fallback. Reason: the fallback differs between Cloudflare Pages (automatic SPA mode when there is no `404.html`) and Workers static assets (`not_found_handling` in `wrangler.jsonc`; a `_redirects` catch-all `/* /index.html 200` is reported by Wrangler as an infinite loop). Hash routes need no server rule, so the same `dist/` works on both and on any static host. Tradeoff: URLs contain `#`. `_redirects` is still shipped (comments only) so nobody adds the looping rule later.

**D11. Design system copied in, not linked.** `scripts/sync-design.sh` copies `tokens.css`, `bundle.css`, the fonts and two logo files from the builtbyjosef design system into `src/design/`, unchanged, and records the commit in `src/design/VERSION`. Alternatives: git submodule (Cloudflare's build would need submodule access and students find submodules confusing), the design system's own `install.sh` (copies everything including `ignite.css`, `jy.js`, matplotlib style and writes `CLAUDE.md`, most of which an app does not use). Reason: the build is self-contained and the design files are never edited here. `ignite.css` and `jy.js` are left out: the app recipe says "calm, no flare", and the only motion the app needs (button and panel hovers) is in `bundle.css`.

## Data and security

**D12. Roles live in `users/{uid}.role`, not in Auth custom claims.** Alternative: custom claims (need the Admin SDK, so a server or Cloud Function). Reason: zero cost and no server. Rules read the role with one `get()`. Tradeoff: each rule evaluation costs one extra document read against the quota (still tiny at this scale). New users can only create themselves as `student`; only an admin can change a role. The very first admin is set by hand in the Firebase console (DEPLOY.md step 6).

**D13. Domain restriction in rules, with an allowlist document.** Rules require Google sign-in, a verified email, and either `@stjbs.sch.id` or an address listed in `config/access.extraEmails`. The UI check is only for a friendly message. Tradeoff: anyone with a Google account can create a Firebase Auth user by opening the popup; they can read and write nothing.

**D14. Teachers never read `users/`.** Student names they need are copied into the class's `members/{uid}` document when the student asks to join (taken from their Google account). Reason: no rule has to answer "which users may this teacher see". Tradeoff: if a student changes their name later, old member documents keep the old one.

**D15. No collection-group queries, no composite indexes.** Admin monitoring loops over classes (a school has a handful) instead of querying across all classes at once. Sorting (help queue by waiting time) happens in the browser on small result sets. Reason: `firestore.indexes.json` stays empty, so a deploy cannot fail on a missing index and there is nothing to keep in sync. Tradeoff: admin pages make one query per class.

**D16. Nothing is hard-deleted.** Members are `rejected` or `removed`, projects `deleted: true`, sessions `deleted: true`, help requests `closed`. Rules deny `delete` everywhere except old join-code documents. Reason: mistakes are recoverable and exports are complete.

**D17. Attendance history is guaranteed by the rules.** Each session write increments `rev` and must write `history/<rev>` in the same batch, and the history entry must equal what was written. History cannot be updated or deleted. Reason: a teacher (or a bug) cannot change attendance without a trace. Tradeoff: every attendance save is two writes.

**D18. Attendance is only written on Submit.** A session document exists only once the teacher submits (or cancels, for a holiday). Expected sessions are computed from the class schedule and term dates, so "not submitted" is everything expected that has no document. Reason: nothing has to "create sessions" on a timer (no server), and the admin sees missing attendance even if a teacher never opened the app. Tradeoff: at most one session per class per day (the document id is the date).

**D19. Pace feedback stores no votes next to names, ever.** `pace/<date>` holds only totals; `pace/<date>/voters/<uid>` is an empty document that stops double voting and is unreadable by teachers and admins. The rules check that a vote adds exactly one to exactly one total and creates the voter marker in the same batch. Voting is open only for the class's most recent submitted session, and totals become readable only after voting has closed (a later session was submitted, and `lastSubmittedSession` can only move forward) and only with 5 or more responses. Reason: anonymity that does not depend on anyone's good behaviour, including the database owner. **Corrected after the independent check (CHECKS.md, finding C1):** the first version let teachers read totals while voting was open; by removing every student except one, a teacher could watch that named student's vote arrive. Closing the window before totals are visible removes that. Remaining, accepted limits: a vote cannot be changed; with exactly 5 voters who all choose the same answer, the totals show what each chose (true of any totals); the export only includes closed sessions with 5 or more responses.

**D20. Curriculum versions are whole documents; the frozen-level check runs in the admin's browser.** Alternative: enforce "frozen levels never change" in rules (would mean deep-comparing nested maps across documents, unreadable). Reason: only admins can write curriculum (rules enforce that), admins are faculty, and the admin page refuses any upload that changes a frozen level. Pins on classes can only grow, which rules do enforce. Tradeoff: a determined admin using the console can bypass the frozen check; that is accepted for trusted faculty.

**D21. Join codes are separate documents (`joinCodes/{code}`).** Students can `get` a code they type but cannot list codes or read classes they have not joined. The member request must quote a code that points at that class. Codes are 6 characters from a 32-letter alphabet without look-alikes (no I, O, 0, 1), about a billion combinations.

## Sign-in and features

**D22. Google sign-in uses the popup flow.** Alternative: redirect flow. Reason: the site (on Cloudflare) and the Firebase auth domain (`<project>.firebaseapp.com`) differ, and the redirect flow breaks in browsers that block third-party storage in that situation. Consequence: the `_headers` file must not send `Cross-Origin-Opener-Policy: same-origin` (it would cut the popup off from the page); it sends `same-origin-allow-popups`.

**D23. The UI hides links a role cannot use, but never relies on that.** Every page also works out what to show from data the rules let it read. A student who types an admin URL gets "not available for your role"; one who types another class's URL gets "You do not have access".

**D24. Weekly project options come from the curriculum.** A teacher posts a project by picking a topic; its `projects` list becomes the options. If a topic has none, the teacher writes one brief. Alternative: free-form options per project. Reason: one source of truth, less typing for student teachers. Tradeoff: to offer a new project idea for every class, add it to the curriculum (a new version, or a later level).

**D25. "Needs help" avoids duplicate open requests per student per project.** Before saving, the app re-reads the student's requests; while one is open, saving updates the submission (the teacher's "Open their work" link always shows the latest code) instead of adding a duplicate. This is app behaviour, not a rule: two saves at the same instant could still create two entries, which is harmless. The student can close their own request ("I solved it").

**D26. Pace votes are for the most recent submitted session only.** The class document carries `lastSubmittedSession`; the student home shows the question until they answer. Students cannot read attendance documents (they contain everyone's marks), so this field is how they learn a session happened.

**D27. Curriculum versions are cached in memory for one visit.** A version document can be large (the whole curriculum) and almost never changes, so `data.js` keeps each one it has fetched until the tab is closed. This is a `Map`, not a caching layer; errata applied by the admin are seen on the next visit.

**D28. Settings constants live in `src/config.js`.** Run timeout (5 s), pace threshold (5, also written in `firestore.rules`), stale-help days (3), export warning days (14). Alternative: an admin-editable settings document. Reason: these rarely change, and a code change is reviewed and recorded; a settings document would need its own rules and UI.

**D29. End-to-end tests drive the real build in Chromium against the emulators.** Sign-in in tests uses `signInWithCredential` with the emulator's unsigned test tokens through a hook (`window.__signInForTest`) that exists only when `VITE_USE_EMULATORS=true`; `scripts/check-dist.js` fails the production build if the hook is present. Tests serve the build with the real `_headers`, so a CSP mistake that would break Python or Firebase fails the tests.

**D31. Every timestamp a user writes must be the server's clock.** Rules require `== request.time` (the app sends `serverTimestamp()`), so a student cannot back-date a help request to jump the queue. Names stored next to actions (`byName`, `answeredByName`) must equal the writer's own profile name.

**D32. Pace totals are fetched one session at a time.** "Voting has closed" depends on the class document, which a rule can check for a single read but cannot prove for a list query. Teacher and admin views read the totals document of each submitted session (a few dozen small reads at most) and skip the ones the rules refuse.

**D30. No theme toggle.** The app follows the device's light or dark setting, as the design system says working surfaces should. A toggle would need storage and code for no real gain.

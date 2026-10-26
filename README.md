# STJBS Coding

The web app for the St. Johannes Berchmans School student-run coding program: classes with join codes, a modular curriculum with pinned versions, a Python topic library with Run buttons, weekly projects with a help queue, attendance, anonymous pace feedback, per-role "This week" screens and dashboards, and an admin export that doubles as the backup.

Static site on Cloudflare + Firebase (Google sign-in, Firestore) on the free plans. No server code. Security lives in `firestore.rules`.

## Start here

| If you want to | Read |
| --- | --- |
| Put it online | [DEPLOY.md](DEPLOY.md) |
| Understand how it fits together | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Know why something is the way it is | [DECISIONS.md](DECISIONS.md) |
| Edit the curriculum | [CURRICULUM_FORMAT.md](CURRICULUM_FORMAT.md) |
| See what was tested and what is left | [CHECKS.md](CHECKS.md) |
| Know where the design system fell short | [DESIGN_GAPS.md](DESIGN_GAPS.md) |

## Commands (VS Code terminal)

| Command | What it does |
| --- | --- |
| `npm ci` | Install exact dependency versions. |
| `npm run dev` | Local site at http://localhost:5173 (see DEPLOY.md, Local development). |
| `npm run emulators` | Local Firebase (Auth + Firestore). Needs Java 21. |
| `npm run seed` | Fill the local emulators with fake people and classes. |
| `npm test` | Unit tests: curriculum rules, dates, CSV, and every curriculum snippet run through Python. |
| `npm run test:rules` | Security rules tests against the Firestore emulator. |
| `npm run test:e2e` | The real build in Chromium against the emulators (needs Playwright with Chromium). |
| `npm run build` | Production build into `dist/`, then checks it is safe to deploy. |
| `npm run design:check` | Design-system lint (Git Bash or WSL). |

Dependencies: `firebase` (auth and database), `lit-html` (safe HTML templates), `pyodide` (Python in the browser); for development `vite`, `firebase-tools`, `@firebase/rules-unit-testing`. Each is justified in DECISIONS.md.

Design: the builtbyjosef design system, copied unchanged into `src/design/` by `scripts/sync-design.sh`.

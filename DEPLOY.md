# Deploy

Everything below is done by the founder (or a faculty owner). No step needs a credit card. **Never upgrade Firebase to the Blaze plan** and never add a payment method to Cloudflare: the app is built to run on the free tiers only.

Each step says where to do it. "VS Code terminal" means the terminal inside VS Code, opened in this repository folder (on Windows it is PowerShell).

## What you need before you start

- The shared club Google account: `stjbscodingclub@gmail.com`. Create the Firebase project and the Cloudflare account with it, so ownership does not leave with any one student.
- This repository on GitHub, with the branch you want to deploy (normally `main` after this work is merged).
- On your computer: Node.js 22 (https://nodejs.org, LTS installer) and Git. Java 21 only if you want to run the rules tests locally (step 13).

## Values you will collect

| Value | Where it comes from | Where it goes |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Step 2 | Cloudflare build variables (step 8) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Step 2 (looks like `your-project.firebaseapp.com`) | Cloudflare build variables |
| `VITE_FIREBASE_PROJECT_ID` | Step 2 | Cloudflare build variables, and step 5 |
| `VITE_FIREBASE_APP_ID` | Step 2 | Cloudflare build variables |
| Site domain, e.g. `stjbs-coding.pages.dev` | Step 8, after the first deploy | Firebase authorised domains (step 9) |

These Firebase values identify the project; they are not passwords. Security comes from `firestore.rules`.

---

## 1. Turn on 2-step verification for the club account

**Where:** browser, signed in as `stjbscodingclub@gmail.com`, at https://myaccount.google.com/security

1. Under "How you sign in to Google", open **2-Step Verification** and turn it on.
2. Add at least two second factors: Mr Ariel's phone (authenticator app or passkey) and one other faculty member's.
3. Open **Backup codes**, generate them, print them and give the paper to Mr Ariel to keep in school. Do not store them in Drive.

Do this first: this account will own the Firebase project and the Cloudflare account.

## 2. Create the Firebase project and get the web settings

**Where:** browser, Firebase console https://console.firebase.google.com, signed in as the club account

1. **Create a project**. Name: `stjbs-coding` (Firebase may add a suffix to the project ID; that is fine). Turn **off** Google Analytics. Gemini/AI assistance: leave off.
2. The project starts on the **Spark (no-cost)** plan. Leave it there.
3. On the project overview, click the **Web** icon (`</>`) to add a web app. Nickname: `stjbs-coding-web`. Do **not** tick "Also set up Firebase Hosting". Register.
4. Firebase shows a `firebaseConfig` block. Copy these four values somewhere safe for step 8:
   `apiKey` → `VITE_FIREBASE_API_KEY`, `authDomain` → `VITE_FIREBASE_AUTH_DOMAIN`, `projectId` → `VITE_FIREBASE_PROJECT_ID`, `appId` → `VITE_FIREBASE_APP_ID`.
   (You can find them again later under the gear icon > **Project settings** > General > Your apps.)

## 3. Turn on Google sign-in

**Where:** browser, Firebase console > **Build > Authentication**

1. **Get started**.
2. **Sign-in method** tab > **Google** > Enable. Public-facing name: `STJBS Coding`. Support email: the club account. Save.
3. Do not enable any other provider. (The rules refuse anything except Google sign-in anyway.)

## 4. Create the Firestore database

**Where:** browser, Firebase console > **Build > Firestore Database**

1. **Create database**.
2. If asked for an edition, choose **Standard**.
3. Database ID: leave `(default)`. Location: **asia-southeast2 (Jakarta)**. The location cannot be changed later.
4. Start in **production mode** (everything locked). Create.

Do not create Cloud Storage, Functions, Hosting or any other product.

## 5. Publish the security rules

**Where:** VS Code terminal, in this repository

```
npm ci
npx firebase login
npx firebase deploy --only firestore --project YOUR_PROJECT_ID
```

`firebase login` opens the browser; sign in as the club account. Replace `YOUR_PROJECT_ID` with `VITE_FIREBASE_PROJECT_ID` from step 2. This uploads `firestore.rules` and `firestore.indexes.json` (which is empty on purpose). The output should end with `Deploy complete!`.

Fallback without the command line: Firebase console > Firestore Database > **Rules** tab, replace everything with the contents of `firestore.rules`, **Publish**.

Every time `firestore.rules` changes in the repository, run the deploy command again. Cloudflare does not deploy rules.

## 6. Allow the club account to sign in

The rules let in any verified `@stjbs.sch.id` Google account. Any other account must be listed.

**Where:** browser, Firebase console > Firestore Database > **Data** tab

1. **Start collection**. Collection ID: `config`.
2. Document ID: `access`.
3. Field: `extraEmails`, type **array**. Add one element, type string: `stjbscodingclub@gmail.com` (all lowercase).
4. Save.

Later, admins edit this list in the app (Admin > People > Non-school accounts).

## 7. Connect the repository to Cloudflare

**Where:** browser, https://dash.cloudflare.com, signed in to a Cloudflare account created with the club email (free plan, no card)

Cloudflare offers two ways to host static files. Use whichever the dashboard shows you; the build output works on both.

**Option A: Pages (preferred if offered).**
1. **Workers & Pages** > **Create** > **Pages** tab > **Connect to Git**.
2. Authorise GitHub and pick this repository.
3. Build settings:
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: leave empty
4. Before the first deploy, open **Environment variables** and add the four variables from step 8 below.
5. **Save and Deploy**.

**Option B: Worker with static assets** (if the dashboard only offers "Import a repository" for Workers).
1. **Workers & Pages** > **Create** > **Import a repository** > pick this repository.
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy` (it reads `wrangler.jsonc`, which serves `dist/` as static assets with no Worker code).
3. Add the four variables from step 8 as **build** variables (Settings > Build > Variables and secrets), not runtime variables.

The repository's `.node-version` file tells Cloudflare to build with Node 22.

## 8. Build variables

**Where:** browser, Cloudflare dashboard > your project > **Settings** > Environment variables (Pages) or **Build** > Variables (Workers)

| Name | Value |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | from step 2 |
| `VITE_FIREBASE_AUTH_DOMAIN` | from step 2 |
| `VITE_FIREBASE_PROJECT_ID` | from step 2 |
| `VITE_FIREBASE_APP_ID` | from step 2 |

Do not set `VITE_USE_EMULATORS`. Set the variables for **Production** (and Preview if you use preview deploys). Then **Retry deployment** / redeploy so the build picks them up. If you open the site and see "Not configured", the variables were missing at build time.

When the deploy finishes, Cloudflare shows the site address, for example `https://stjbs-coding.pages.dev` (Pages) or `https://stjbs-coding.<account>.workers.dev` (Workers). Note the host name without `https://`.

The build fails on purpose if any file is over Cloudflare's 25 MiB limit or if test-only code slipped in (`scripts/check-dist.js`).

## 9. Authorise the site domain for sign-in

**Where:** browser, Firebase console > **Build > Authentication** > **Settings** tab > **Authorized domains**

1. **Add domain**: the host from step 8, e.g. `stjbs-coding.pages.dev`.
2. If you later add a custom domain in Cloudflare (e.g. `coding.stjbs.sch.id`), add that too.

Without this, the Google popup closes with an "unauthorized domain" error.

## 10. Make the first admin

**Where:** browser, the deployed site, then the Firebase console

1. Open the site and **Sign in with Google** with the club account (or your own school account). You land on "This week" as a student.
2. Firebase console > Firestore Database > Data > `users` > the document whose `email` is the account you used > field `role` > change `student` to `admin` > Update.
3. Reload the site. Admin menu items appear (Monitoring, Classes, People, Curriculum, Export).

From now on, roles are changed in the app: **Admin > People**. Ask Mr Ariel and Mr Julio to sign in once with their school accounts, then make them `admin`. Make student teachers `teacher`.

## 11. Publish the first curriculum and create classes

**Where:** browser, the deployed site, signed in as an admin

1. **Curriculum** > New version > choose `curriculum/curriculum.json` from the repository (download it from GitHub if needed) > wait for the check and snippet run > **Publish as version 1**. Replace the sample slide links (`REPLACE-WITH-REAL-SLIDES-ID`) first, or fix them later as errata.
2. **Classes** > New class: name, track, teachers (people must have the `teacher` or `admin` role first), weekly sessions (Jakarta time), term dates. Create.
3. Give the class's join code (on the class Overview) to its students.

## 12. Add Mr Ariel as owner on every service

So the program survives after the founder leaves.

- **Firebase. Where:** Firebase console > gear icon > **Users and permissions** > **Add member** > Mr Ariel's email > role **Owner** > Add member. He accepts the email invitation.
- **Cloudflare. Where:** Cloudflare dashboard > **Manage account** > **Members** > **Invite** > Mr Ariel's email > role **Super Administrator - All Privileges** > Continue, Invite. He accepts the email invitation.
- **GitHub. Where:** github.com > this repository > **Settings** > **Collaborators and teams** > **Add people** > Mr Ariel's GitHub username > role **Admin**. (If the repository lives in an organisation, an organisation owner makes him an **Owner** of the organisation instead.)
- **Club Google account:** Mr Ariel already holds backup codes and a second factor from step 1. Give him the password in person.

## 13. (Optional) Check the rules yourself

**Where:** VS Code terminal. Needs Java 21 (Windows: install "Temurin 21" from https://adoptium.net).

```
npm ci
npm test
npm run test:rules
```

`test:rules` starts the Firestore emulator and runs every role against every collection. All tests should pass. See CHECKS.md for what was verified before handover.

## 14. (Optional) Lock the API key to the site

**Where:** browser, https://console.cloud.google.com > select the Firebase project > **APIs & Services > Credentials** > the key named "Browser key (auto created by Firebase)" > **Application restrictions: Websites** > add `https://YOUR-SITE/*` and `https://YOUR_PROJECT_ID.firebaseapp.com/*` > Save.

Not required for security (the rules are), but it stops other sites using the key against your quota.

---

## Updating the app later

- **Code:** merge to `main` on GitHub. Cloudflare rebuilds and deploys by itself.
- **Rules:** VS Code terminal: `npx firebase deploy --only firestore --project YOUR_PROJECT_ID`.
- **Curriculum:** Admin > Curriculum (see CURRICULUM_FORMAT.md).
- **Backups:** Admin > Export, at least every 14 days; keep the files in the program's shared Drive folder. A banner reminds admins when it is overdue.

## Local development

**Where:** VS Code terminal

```
npm ci
copy .env.example .env        (Windows PowerShell)   or   cp .env.example .env   (Git Bash / macOS / Linux)
```

Edit `.env`: set `VITE_USE_EMULATORS=true` and `VITE_FIREBASE_PROJECT_ID=demo-stjbs`. Then, in two terminals:

```
npm run emulators            (terminal 1, needs Java 21; leave running)
npm run seed                 (terminal 2: loads fake people and classes)
npm run dev                  (terminal 2: opens http://localhost:5173)
```

On the sign-in page, use the box **Emulator only: sign in as** and type one of the emails that `npm run seed` prints, for example `tara.teacher@stjbs.sch.id` (teacher), `ana.student@stjbs.sch.id` (student) or `faculty.admin@stjbs.sch.id` (admin). This box exists only when `VITE_USE_EMULATORS=true`; it is removed from the real build. All data is fake and lives only on your computer.

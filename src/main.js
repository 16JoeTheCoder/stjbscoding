// Entry point: sign-in, then the router. Routes and who may open them are listed here.
import "./design/tokens.css";
import "./design/bundle.css";
import "./styles.css";
import { render, html } from "lit-html";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { auth, configMissing } from "./firebase.js";
import { getProfile, createProfile } from "./data.js";
import { startRouter } from "./router.js";
import { friendlyError } from "./ui.js";
import { SCHOOL_DOMAIN } from "./config.js";

import home from "./pages/home.js";
import dashboard from "./pages/dashboard.js";
import join from "./pages/join.js";
import classPage from "./pages/class.js";
import project from "./pages/project.js";
import library from "./pages/library.js";
import topic from "./pages/topic.js";
import attributions from "./pages/attributions.js";
import settings from "./pages/settings.js";

// Admin pages are loaded only when an admin opens them.
const lazy = (load) => async (ctx) => (await load()).default(ctx);
const adminClasses = lazy(() => import("./pages/admin-classes.js"));
const adminPeople = lazy(() => import("./pages/admin-people.js"));
const adminCurriculum = lazy(() => import("./pages/admin-curriculum.js"));
const adminExport = lazy(() => import("./pages/admin-export.js"));

const ROUTES = [
  ["/", home],
  ["/dashboard", dashboard],
  ["/join", join],
  ["/class/:id/project/:pid", project],
  ["/class/:id/:tab?", classPage],
  ["/library", library],
  ["/topic/:id", topic],
  ["/attributions", attributions],
  ["/settings", settings],
  ["/admin/classes/:id?", adminClasses, ["admin"]],
  ["/admin/people", adminPeople, ["admin"]],
  ["/admin/curriculum", adminCurriculum, ["admin"]],
  ["/admin/export", adminExport, ["admin"]],
];

const app = document.getElementById("app");
app.replaceChildren();   // remove the static "Loading..." so lit-html owns the container

function signInScreen(message = "") {
  render(html`
    <main class="signin">
      <p class="jy-eyebrow">St. Johannes Berchmans School</p>
      <h1 class="jy-pair signin__title">STJBS <b>Coding</b></h1>
      <p class="lead">Classes, weekly projects and Python practice for the student-run coding program.</p>
      <button class="jy-btn jy-btn--accent" @click=${signIn}>Sign in with Google</button>
      <p class="muted">Use your @${SCHOOL_DOMAIN} school account.</p>
      ${message ? html`<div class="notice notice--bad" role="alert"><span class="jy-badge jy-badge--bad">Problem</span> ${message}</div>` : ""}
      ${devSignIn ? devSignIn() : ""}
    </main>`, app);
}

async function signIn() {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    // Popup, not redirect: redirects break on browsers that block third-party storage
    // when the site and the Firebase auth domain differ (DECISIONS.md D22).
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") signInScreen(friendlyError(e));
  }
}

async function loadProfile(user) {
  // Fails with permission-denied when the account is not a school account (rules decide).
  try {
    return (await getProfile(user.uid)) || (await createProfile(user));
  } catch (e) {
    if (String(e.code).includes("permission-denied")) return null;
    throw e;
  }
}

if (configMissing) {
  render(html`<main class="signin"><h1 class="jy-pair signin__title">Not <b>configured</b></h1><p>This build has no Firebase settings. See DEPLOY.md, step 8.</p></main>`, app);
} else {
  let started = false;
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (started) location.reload();   // signed out: start clean
      return signInScreen();
    }
    try {
      const profile = await loadProfile(user);
      if (!profile) {
        await signOut(auth);
        return signInScreen(`${user.email} cannot use this site. Sign in with your @${SCHOOL_DOMAIN} account.`);
      }
      started = true;
      startRouter(ROUTES, { ...profile, id: user.uid });
    } catch (e) {
      signInScreen(friendlyError(e));
    }
  });
}

// LOCAL EMULATORS ONLY: sign in by typing an email, without the Google popup.
// Used by `npm run dev` with the emulators and by the end-to-end tests. Vite removes all of
// this from production builds, and scripts/check-dist.js fails the build if it is ever left in.
const devSignIn = import.meta.env.VITE_USE_EMULATORS === "true"
  ? () => html`
    <form class="form" @submit=${(e) => { e.preventDefault(); window.__signInForTest(new FormData(e.target).get("email")); }}>
      <label class="jy-field"><span class="jy-field__label">Emulator only: sign in as</span>
        <input class="jy-field__input" name="email" type="email" placeholder="tara.teacher@stjbs.sch.id" /></label>
      <div><button class="jy-btn jy-btn--ghost" type="submit">Sign in with this email</button></div>
    </form>`
  : null;
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  window.__signInForTest = async (email, name = email.split("@")[0]) => {
    const { signInWithCredential } = await import("firebase/auth");
    const token = JSON.stringify({ sub: email, email, email_verified: true, name });
    await signInWithCredential(auth, GoogleAuthProvider.credential(token));
  };
}

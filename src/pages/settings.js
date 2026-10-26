// Settings: name, sign out, links. The builtbyjosef credit appears here and nowhere else.
import { html, nothing } from "lit-html";
import { signOut } from "firebase/auth";
import { auth } from "../firebase.js";
import * as data from "../data.js";
import { pageHead, busy, notice } from "../ui.js";
import logoLight from "../design/logos/tab-primary-light.svg";
import logoDark from "../design/logos/tab-primary-dark.svg";

export default async function settings(ctx) {
  const s = { name: ctx.me.name, saved: false };
  return () => html`
    ${pageHead("Account", "", "Settings")}
    ${s.saved ? notice("Name saved.", "ok") : nothing}
    <div class="form">
      <p><span class="jy-field__label">Signed in as</span><br />${ctx.me.email} <span class="muted">(${ctx.me.role})</span></p>
      ${ctx.me.role === "student" ? html`
        <label class="jy-field"><span class="jy-field__label">Display name</span>
          <input class="jy-field__input" maxlength="100" .value=${s.name} @input=${(e) => { s.name = e.target.value; }} />
          <span class="jy-field__help">Shown on new join requests and help requests.</span></label>`
        : html`<p><span class="jy-field__label">Name</span><br />${ctx.me.name} <span class="muted">(staff names appear in attendance history; an admin can change it in the Firebase console)</span></p>`}
      <div class="row">
        ${ctx.me.role === "student" ? html`<button class="jy-btn jy-btn--ghost" @click=${(e) => busy(e, async () => {
          await data.updateName(ctx.me.id, s.name.trim());
          ctx.me.name = s.name.trim();
          s.saved = true;
          ctx.rerender();
        })}>Save name</button>` : nothing}
        <button class="jy-btn jy-btn--ghost" @click=${() => signOut(auth)}>Sign out</button>
      </div>
      <p><a href="#/attributions">Curriculum sources and licences</a></p>
    </div>
    <footer class="credit">
      <picture>
        <source srcset=${logoDark} media="(prefers-color-scheme: dark)" />
        <img src=${logoLight} alt="" width="18" height="32" />
      </picture>
      <span>Designed and built by Josef Yang</span>
    </footer>`;
}

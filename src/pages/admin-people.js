// Admin: roles (student, teacher, admin) and the list of non-school emails allowed to sign in.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { pageHead, busy, problem, notice } from "../ui.js";
import { SCHOOL_DOMAIN } from "../config.js";

export default async function adminPeople(ctx) {
  const [users, access] = await Promise.all([data.listUsers(), data.getAccess()]);
  const s = { error: "", msg: "", filter: "", extra: (access?.extraEmails || []).join("\n") };
  users.sort((a, b) => a.name.localeCompare(b.name));
  const setRole = (u, role) => (e) => busy(e, async () => {
    if (u.id === ctx.me.id && role !== "admin" && !confirm("Remove your own admin role? You will lose access to admin pages.")) return;
    await data.setRole(u.id, role);
    u.role = role;
    s.msg = `${u.name} is now ${role}.`;
    ctx.rerender();
  }, (msg) => { s.error = msg; ctx.rerender(); });

  const saveAccess = (e) => busy(e, async () => {
    const emails = [...new Set(s.extra.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
    const bad = emails.find((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (bad) throw new Error(`"${bad}" is not an email address.`);
    await data.setAccess(emails);
    s.msg = "Allowed emails saved.";
    ctx.rerender();
  }, (msg) => { s.error = msg; ctx.rerender(); });

  return () => {
    const shown = users.filter((u) => !s.filter || `${u.name} ${u.email}`.toLowerCase().includes(s.filter.toLowerCase()));
    return html`
      ${pageHead("Admin", "", "People")}
      ${s.error ? problem(s.error) : nothing}
      ${s.msg ? notice(s.msg, "ok") : nothing}
      <p class="prose mb-4">Everyone who has signed in. New people start as students. Make student teachers <b>teacher</b> and faculty <b>admin</b>.</p>
      <label class="jy-field mb-4"><span class="jy-field__label">Search</span>
        <input class="jy-field__input" .value=${s.filter} @input=${(e) => { s.filter = e.target.value; ctx.rerender(); }} /></label>
      <div class="table-wrap"><table class="jy-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
        <tbody>${shown.map((u) => html`<tr><td>${u.name}</td><td>${u.email}</td><td>
          <span class="choice" role="radiogroup" aria-label=${`Role for ${u.name}`}>
            ${["student", "teacher", "admin"].map((r) => html`<label><input type="radio" name=${"role-" + u.id} .checked=${u.role === r} @change=${setRole(u, r)} /><span>${r}</span></label>`)}
          </span></td></tr>`)}</tbody>
      </table></div>

      <h2 class="section">Non-school accounts allowed to sign in</h2>
      <div class="form">
        <p class="muted">Anyone with an @${SCHOOL_DOMAIN} account can sign in. Add other Google accounts here (for example the club account), one per line. They still start as students.</p>
        <label class="jy-field"><span class="jy-field__label">Allowed emails</span>
          <textarea class="jy-field__input mono" .value=${s.extra} @input=${(e) => { s.extra = e.target.value; }}></textarea></label>
        <div><button class="jy-btn jy-btn--ghost" @click=${saveAccess}>Save allowed emails</button></div>
      </div>`;
  };
}

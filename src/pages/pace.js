// The one-tap pace question a student sees after a session, and the totals teachers see.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { busy } from "../ui.js";
import { formatDate } from "../time.js";
import { PACE_MIN_RESPONSES } from "../config.js";

const CHOICES = [["easy", "Too easy"], ["right", "About right"], ["hard", "Too hard"]];

// Student widget. Votes are anonymous: only totals are stored (DECISIONS.md D19).
export function paceWidget(ctx, cls) {
  const date = cls.lastSubmittedSession;
  const state = (paceWidget.state[`${cls.id}/${date}`] ??= { done: false, error: "" });
  if (state.done) return html`<h3>Thanks</h3><p>Your answer was counted anonymously.</p>`;
  return html`
    <h3>How was the pace?</h3>
    <p>Session ${formatDate(date)}. Anonymous: nobody can see who answered.</p>
    <div class="row">
      ${CHOICES.map(([key, label]) => html`
        <button class="jy-btn jy-btn--ghost" @click=${(e) => busy(e, async () => {
          await data.vote(cls.id, date, ctx.me.id, key);
          state.done = true;
          ctx.rerender();
        }, (msg) => { state.error = msg; ctx.rerender(); })}>${label}</button>`)}
    </div>
    ${state.error ? html`<p class="muted">Could not save your answer. Try again.</p>` : nothing}`;
}
paceWidget.state = {};

// Teacher/admin table of totals (only sessions with enough answers are readable at all).
export function paceTable(rows) {
  if (!rows.length) return html`<p class="muted">Nothing to show yet. A session's totals appear once the next session's attendance is submitted (voting has closed) and only if ${PACE_MIN_RESPONSES} or more students answered, so nobody's answer can be singled out.</p>`;
  return html`
    <div class="table-wrap"><table class="jy-table">
      <thead><tr><th>Session</th><th class="num">Too easy</th><th class="num">About right</th><th class="num">Too hard</th><th class="num">Answers</th></tr></thead>
      <tbody>${rows.sort((a, b) => (a.id < b.id ? 1 : -1)).map((p) => html`
        <tr><td>${formatDate(p.id)}</td><td class="num">${p.easy}</td><td class="num">${p.right}</td><td class="num">${p.hard}</td><td class="num">${p.n}</td></tr>`)}
      </tbody></table></div>`;
}

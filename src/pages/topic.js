// One topic: overview, lessons (Drive slides), runnable snippets and project ideas.
// With ?class=<id> it shows the version of the topic that class is pinned to.
import { html, nothing } from "lit-html";
import * as data from "../data.js";
import { classLevels } from "../curriculum.js";
import { pageHead, empty } from "../ui.js";
import { codeBox, newCodeState } from "../editor.js";

export default async function topicPage(ctx) {
  const cls = ctx.query.class ? await data.getClass(ctx.query.class) : null;
  const { latest, versions } = await data.loadCurriculum(cls?.pins);
  let found = null;
  const tracks = cls ? [cls.track] : ["python", "scratch"];
  for (const track of tracks) {
    for (const { level, version } of classLevels(track, cls?.pins || {}, latest, versions)) {
      const topic = level.topics.find((t) => t.id === ctx.params.id);
      if (topic) found = { level, topic, version };
    }
  }
  if (!found) throw new Error("This topic is not in the curriculum.");
  const { level, topic, version } = found;
  const boxes = (topic.snippets || []).map((s) => ({ s, state: newCodeState(s.code, s.stdin) }));

  return () => html`
    ${pageHead(`${level.title}${cls ? ` · ${cls.name}` : ""}`, "", topic.title)}
    ${topic.overview ? html`<p class="lead">${topic.overview}</p>` : nothing}

    ${topic.lessons?.length ? html`
      <h2 class="section">Lessons</h2>
      <ul class="list">${topic.lessons.map((l) => html`
        <li><b>${l.title}</b>${l.overview ? html`<p class="muted">${l.overview}</p>` : nothing}
          ${l.slides ? html`<p class="mt-2"><a href=${l.slides} target="_blank" rel="noopener">Open slides</a> <span class="muted small">(school account needed)</span></p>` : nothing}</li>`)}</ul>` : nothing}

    ${boxes.length ? html`
      <h2 class="section">Examples</h2>
      <p class="muted">Edit and run. Reset puts the example back.</p>
      ${boxes.map(({ s, state }) => html`<h3 class="mt-6">${s.title}</h3>${codeBox(state, ctx.rerender, { title: `${s.id}.py` })}`)}` : nothing}

    ${topic.projects?.length ? html`
      <h2 class="section">Project ideas</h2>
      <ul class="list">${topic.projects.map((p) => html`<li><b>${p.title}</b>${p.brief ? html`<p class="muted">${p.brief}</p>` : nothing}</li>`)}</ul>` : nothing}

    ${!topic.lessons?.length && !boxes.length && !topic.projects?.length ? empty("Nothing here yet.") : nothing}
    ${topic.source ? html`<p class="small muted mt-7">Source: ${topic.source.url ? html`<a href=${topic.source.url} target="_blank" rel="noopener">${topic.source.title}</a>` : topic.source.title}${topic.source.licence ? `, ${topic.source.licence}` : ""}.</p>` : nothing}
    <p class="small muted mt-2">Curriculum version ${version}.</p>`;
}

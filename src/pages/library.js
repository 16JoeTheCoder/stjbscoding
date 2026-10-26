// Topic reference library: every Python topic in the latest curriculum, each with runnable snippets.
import { html } from "lit-html";
import * as data from "../data.js";
import { findTrack } from "../curriculum.js";
import { pageHead, empty } from "../ui.js";

export default async function library() {
  const { latest, versions } = await data.loadCurriculum();
  const tracks = ["python", "scratch"].map((id) => findTrack(versions[latest], id)).filter(Boolean);
  return () => html`
    ${pageHead("Reference", "Topic", "library")}
    <p class="lead mb-6">Short explanations with examples you can edit and run. Python runs in your browser; nothing is saved.</p>
    ${tracks.length === 0 ? empty("No curriculum has been published yet.") : tracks.map((t) => html`
      <h2 class="section">${t.title}</h2>
      ${t.levels.map((l) => html`
        <h3 class="sub">${l.title}</h3>
        <div class="grid">${l.topics.map((tp) => html`
          <a class="jy-panel jy-panel--link panel-link" href="#/topic/${tp.id}">
            <h3>${tp.title}</h3>
            ${tp.overview ? html`<p>${tp.overview}</p>` : ""}
            ${tp.snippets?.length ? html`<p class="small mt-2">${tp.snippets.length} example(s)</p>` : ""}
          </a>`)}</div>`)}`)}
    <p class="mt-7"><a href="#/attributions">Sources and licences</a></p>`;
}

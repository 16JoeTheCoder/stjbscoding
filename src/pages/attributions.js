// Sources and licences cited by curriculum topics (latest version).
import { html } from "lit-html";
import * as data from "../data.js";
import { pageHead, empty } from "../ui.js";

export default async function attributions() {
  const { latest, versions } = await data.loadCurriculum();
  const rows = [];
  for (const t of versions[latest]?.tracks || []) for (const l of t.levels) for (const tp of l.topics) {
    if (tp.source) rows.push({ track: t.title, topic: tp, source: tp.source });
  }
  return () => html`
    ${pageHead("Curriculum", "Sources and", "licences")}
    <p class="lead mb-6">Material that topics are based on, with its licence.</p>
    ${rows.length === 0 ? empty("No sources are cited yet.") : html`
      <div class="table-wrap"><table class="jy-table">
        <thead><tr><th>Topic</th><th>Source</th><th>Licence</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><td>${r.track}: <a href="#/topic/${r.topic.id}">${r.topic.title}</a></td>
          <td class="wrap">${r.source.url ? html`<a href=${r.source.url} target="_blank" rel="noopener">${r.source.title}</a>` : r.source.title}</td>
          <td>${r.source.licence || "Not stated"}</td></tr>`)}</tbody>
      </table></div>`}`;
}

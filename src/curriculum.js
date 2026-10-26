// Curriculum logic: validate an uploaded file, check frozen levels, check errata,
// and work out which version of each level a class sees. Pure functions, no Firebase,
// so they run in the browser and in Node tests. Format: CURRICULUM_FORMAT.md.

export const TRACK_IDS = ["python", "scratch"];
const ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const URL_RE = /^https:\/\/\S+$/;
// Fields an erratum may change. Everything else (ids, order, code, stdin) must stay identical.
export const ERRATA_FIELDS = ["title", "overview", "slides", "brief", "source", "url", "licence"];

// Returns a list of human-readable problems. An empty list means the file is valid.
export function validateCurriculum(c) {
  const errors = [];
  const seen = new Set();
  const err = (path, msg) => errors.push(`${path}: ${msg}`);

  const text = (obj, key, path, { required = true, max = 2000 } = {}) => {
    const v = obj[key];
    if (v === undefined || v === "") { if (required) err(path, `"${key}" is required`); return; }
    if (typeof v !== "string") err(path, `"${key}" must be text`);
    else if (v.length > max) err(path, `"${key}" is longer than ${max} characters`);
  };
  const url = (obj, key, path, required) => {
    text(obj, key, path, { required, max: 500 });
    if (typeof obj[key] === "string" && obj[key] && !URL_RE.test(obj[key])) err(path, `"${key}" must be an https:// link`);
  };
  const id = (obj, path) => {
    if (typeof obj.id !== "string" || !ID.test(obj.id)) {
      err(path, `"id" must be lowercase letters, digits and dashes (got ${JSON.stringify(obj.id)})`);
    } else if (seen.has(obj.id)) {
      err(path, `id "${obj.id}" is used twice; every id must be unique in the file`);
    } else seen.add(obj.id);
  };
  const only = (obj, keys, path) => {
    for (const k of Object.keys(obj)) if (!keys.includes(k)) err(path, `unknown field "${k}"`);
  };
  const list = (obj, key, path, { min = 0 } = {}) => {
    const v = obj[key];
    if (v === undefined && min === 0) return [];
    if (!Array.isArray(v)) { err(path, `"${key}" must be a list`); return []; }
    if (v.length < min) err(path, `"${key}" needs at least ${min} item(s)`);
    return v.filter((x, i) => {
      if (x && typeof x === "object" && !Array.isArray(x)) return true;
      err(`${path}.${key}[${i}]`, "must be an object");
      return false;
    });
  };

  if (!c || typeof c !== "object" || Array.isArray(c)) return ["The file must contain one JSON object."];
  only(c, ["$schema", "formatVersion", "tracks"], "file");
  if (c.formatVersion !== 1) err("file", `"formatVersion" must be 1`);

  for (const [ti, track] of list(c, "tracks", "file", { min: 1 }).entries()) {
    const tp = `tracks[${ti}]`;
    only(track, ["id", "title", "levels"], tp);
    if (!TRACK_IDS.includes(track.id)) err(tp, `track id must be one of ${TRACK_IDS.join(", ")}`);
    id(track, tp);
    text(track, "title", tp, { max: 80 });

    for (const [li, level] of list(track, "levels", tp, { min: 1 }).entries()) {
      const lp = `${track.id}/levels[${li}]`;
      only(level, ["id", "title", "overview", "topics"], lp);
      id(level, lp);
      text(level, "title", lp, { max: 120 });
      text(level, "overview", lp, { required: false });

      for (const [pi, topic] of list(level, "topics", lp, { min: 1 }).entries()) {
        const tpp = `${level.id}/topics[${pi}]`;
        only(topic, ["id", "title", "overview", "source", "lessons", "snippets", "projects"], tpp);
        id(topic, tpp);
        text(topic, "title", tpp, { max: 120 });
        text(topic, "overview", tpp, { required: false });

        if (topic.source !== undefined) {
          if (!topic.source || typeof topic.source !== "object") err(tpp, `"source" must be an object`);
          else {
            only(topic.source, ["title", "url", "licence"], `${tpp}.source`);
            text(topic.source, "title", `${tpp}.source`, { max: 200 });
            url(topic.source, "url", `${tpp}.source`, false);
            text(topic.source, "licence", `${tpp}.source`, { max: 80 });
          }
        }

        for (const [i, lesson] of list(topic, "lessons", tpp).entries()) {
          const p = `${topic.id}/lessons[${i}]`;
          only(lesson, ["id", "title", "overview", "slides"], p);
          id(lesson, p);
          text(lesson, "title", p, { max: 120 });
          text(lesson, "overview", p, { required: false });
          url(lesson, "slides", p, false);
        }

        for (const [i, snip] of list(topic, "snippets", tpp).entries()) {
          const p = `${topic.id}/snippets[${i}]`;
          if (track.id !== "python") err(p, "snippets are only allowed in the python track");
          only(snip, ["id", "title", "code", "stdin"], p);
          id(snip, p);
          text(snip, "title", p, { max: 120 });
          text(snip, "code", p, { max: 5000 });
          if (snip.stdin !== undefined && !(Array.isArray(snip.stdin) && snip.stdin.every((s) => typeof s === "string"))) {
            err(p, `"stdin" must be a list of text lines`);
          }
        }

        for (const [i, proj] of list(topic, "projects", tpp).entries()) {
          const p = `${topic.id}/projects[${i}]`;
          only(proj, ["id", "title", "brief", "starter"], p);
          id(proj, p);
          text(proj, "title", p, { max: 120 });
          text(proj, "brief", p, { required: false });
          text(proj, "starter", p, { required: false, max: 5000 });
        }
      }
    }
  }
  return errors;
}

// ---------- Lookups ----------

export function findTrack(data, trackId) {
  return data?.tracks?.find((t) => t.id === trackId) || null;
}

export function findLevel(data, levelId) {
  for (const t of data?.tracks || []) {
    const l = t.levels.find((x) => x.id === levelId);
    if (l) return l;
  }
  return null;
}

// Every snippet in the file, with where it lives, for the upload validator.
export function allSnippets(data) {
  const out = [];
  for (const t of data.tracks) for (const l of t.levels) for (const tp of l.topics) {
    for (const s of tp.snippets || []) out.push({ ...s, where: `${l.id} / ${tp.id} / ${s.id}` });
  }
  return out;
}

// ---------- Frozen levels ----------

// Deep equality for plain JSON values (key order does not matter).
export function sameJson(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}

// A level is frozen once any class has pinned it. pinsByClass: [{ className, pins: {levelId: version} }].
// versions: { [version]: curriculumData }. Returns problems; empty means the new data is acceptable.
export function frozenProblems(newData, pinsByClass, versions) {
  const problems = [];
  const checked = new Map(); // "levelId@version" -> done
  for (const { className, pins } of pinsByClass) {
    for (const [levelId, version] of Object.entries(pins || {})) {
      const key = `${levelId}@${version}`;
      if (checked.has(key)) continue;
      checked.set(key, true);
      const frozen = findLevel(versions[version], levelId);
      if (!frozen) continue; // pinned version missing: nothing to compare against
      const now = findLevel(newData, levelId);
      if (!now) problems.push(`Level "${levelId}" is frozen (${className} uses version ${version}) but is missing from the new file.`);
      else if (!sameJson(frozen, now)) problems.push(`Level "${levelId}" is frozen (${className} uses version ${version}) but the new file changes it. Upload typo fixes as errata to version ${version} instead.`);
    }
  }
  return problems;
}

// ---------- Errata ----------

// An erratum may change only text in ERRATA_FIELDS. Ids, order, structure and code stay identical.
// Returns { problems: [...], changes: [...paths] }.
export function errataDiff(oldData, newData) {
  const problems = [];
  const changes = [];
  const walk = (a, b, path, key) => {
    if (sameJson(a, b)) return;
    const bothText = typeof a === "string" && typeof b === "string";
    if (bothText && ERRATA_FIELDS.includes(key)) { changes.push(path); return; }
    if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
      if (Array.isArray(a) && a.length !== b.length) { problems.push(`${path}: number of items changed`); return; }
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        if (!Object.hasOwn(a, k) || !Object.hasOwn(b, k)) {
          // Adding or removing an optional text field (e.g. a missing slides link) is allowed.
          const v = Object.hasOwn(a, k) ? a[k] : b[k];
          if (typeof v === "string" && ERRATA_FIELDS.includes(k)) changes.push(`${path}.${k}`);
          else problems.push(`${path}.${k}: added or removed`);
          continue;
        }
        const label = Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`;
        walk(a[k], b[k], label, Array.isArray(a) ? key : k);
      }
      return;
    }
    problems.push(`${path}: "${key}" cannot change in an erratum`);
  };
  walk(oldData, newData, "file", "");
  return { problems, changes };
}

// ---------- What a class sees ----------

// Levels of a class's track, each from the version the class pinned, or the latest if not pinned.
// versions: { [version]: data }. Returns [{ level, version, pinned }].
export function classLevels(track, pins, latest, versions) {
  const out = [];
  const latestTrack = findTrack(versions[latest], track);
  const ids = (latestTrack?.levels || []).map((l) => l.id);
  // Levels a class pinned that a rollback removed from the latest version still show.
  for (const id of Object.keys(pins || {})) if (!ids.includes(id)) ids.push(id);
  for (const id of ids) {
    const v = pins?.[id] ?? latest;
    const level = findTrack(versions[v], track)?.levels.find((l) => l.id === id);
    if (level) out.push({ level, version: v, pinned: pins?.[id] !== undefined });
  }
  return out;
}

// Flat list of topics in order, for the progress pointer.
export function topicsInOrder(levels) {
  return levels.flatMap(({ level }) => level.topics.map((topic) => ({ level, topic })));
}

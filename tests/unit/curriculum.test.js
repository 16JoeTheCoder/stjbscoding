// Curriculum format, frozen-level and errata rules. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateCurriculum, frozenProblems, errataDiff, classLevels, topicsInOrder, allSnippets,
} from "../../src/curriculum.js";

const sample = () => JSON.parse(readFileSync("curriculum/curriculum.json", "utf8"));

test("the sample curriculum is valid", () => {
  assert.deepEqual(validateCurriculum(sample()), []);
});

test("validation catches duplicate ids, bad ids, bad links and snippets outside python", () => {
  const c = sample();
  c.tracks[0].levels[1].id = "py-l1";
  c.tracks[0].levels[0].topics[0].lessons[0].slides = "http://insecure.example";
  c.tracks[0].levels[0].topics[1].id = "Bad Id";
  c.tracks[1].levels[0].topics[0].snippets = [{ id: "sc-x", title: "x", code: "print(1)" }];
  c.tracks[0].extra = 1;
  const errors = validateCurriculum(c).join("\n");
  assert.match(errors, /used twice/);
  assert.match(errors, /https:\/\//);
  assert.match(errors, /lowercase letters/);
  assert.match(errors, /only allowed in the python track/);
  assert.match(errors, /unknown field "extra"/);
});

test("validation rejects non-objects and wrong formatVersion", () => {
  assert.equal(validateCurriculum([]).length, 1);
  assert.match(validateCurriculum({ formatVersion: 2, tracks: [] }).join(), /formatVersion/);
});

test("frozen levels: unchanged passes, changed or missing is rejected, unfrozen may change", () => {
  const v1 = sample();
  const pins = [{ className: "Python A", pins: { "py-l1": 1 } }];
  const next = sample();
  next.tracks[0].levels[2].topics[0].title = "Strings and text";   // py-l3 is not frozen
  next.tracks[0].levels.push({ id: "py-l4", title: "Level 4", topics: [{ id: "py-files", title: "Files" }] });
  assert.deepEqual(frozenProblems(next, pins, { 1: v1 }), []);

  const changed = sample();
  changed.tracks[0].levels[0].topics[0].snippets[0].code = "print('changed')";
  assert.match(frozenProblems(changed, pins, { 1: v1 }).join(), /py-l1.*frozen.*changes it/);

  const removed = sample();
  removed.tracks[0].levels.shift();
  assert.match(frozenProblems(removed, pins, { 1: v1 }).join(), /missing/);
});

test("rollback: a frozen level missing from the older version is allowed, a changed one is not", () => {
  const v1 = sample();
  const v2 = sample();
  v2.tracks[0].levels.push({ id: "py-l4", title: "Level 4", topics: [{ id: "py-files", title: "Files" }] });
  const pins = [{ className: "Python A", pins: { "py-l1": 2, "py-l4": 2 } }];
  assert.deepEqual(frozenProblems(v1, pins, { 1: v1, 2: v2 }, { allowMissing: true }), []);
  const v1changed = sample();
  v1changed.tracks[0].levels[0].title = "Different";
  assert.equal(frozenProblems(v1changed, pins, { 1: v1changed, 2: v2 }, { allowMissing: true }).length, 1);
});

test("errata: text fixes pass; code, ids and structure changes are rejected", () => {
  const old = sample();
  const fixed = sample();
  fixed.tracks[0].levels[0].topics[0].title = "Output with print()";
  fixed.tracks[0].levels[0].topics[0].lessons[0].slides = "https://docs.google.com/presentation/d/NEW/edit";
  delete fixed.tracks[0].levels[0].topics[1].lessons[0].slides;
  const ok = errataDiff(old, fixed);
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.changes.length, 3);

  const code = sample();
  code.tracks[0].levels[0].topics[0].snippets[0].code = "print(1)";
  assert.match(errataDiff(old, code).problems.join(), /"code" cannot change/);
  const id = sample();
  id.tracks[0].levels[0].topics[0].id = "py-output";
  assert.match(errataDiff(old, id).problems.join(), /"id" cannot change/);
  const added = sample();
  added.tracks[0].levels[0].topics.push({ id: "py-new", title: "New" });
  assert.match(errataDiff(old, added).problems.join(), /number of items/);
});

test("a class sees pinned levels from their version and the rest from latest", () => {
  const v1 = sample();
  const v2 = sample();
  v2.tracks[0].levels[0].title = "Changed in v2";
  v2.tracks[0].levels[1].title = "Level 2 v2";
  const levels = classLevels("python", { "py-l1": 1 }, 2, { 1: v1, 2: v2 });
  assert.equal(levels[0].level.title, v1.tracks[0].levels[0].title);
  assert.equal(levels[0].pinned, true);
  assert.equal(levels[1].level.title, "Level 2 v2");
  assert.equal(levels[1].version, 2);
  assert.equal(topicsInOrder(levels).length, 8);
});

test("a level a class pinned stays visible after a rollback removes it from latest", () => {
  const v1 = sample();
  const v2 = sample();
  v2.tracks[0].levels.push({ id: "py-l4", title: "Level 4", topics: [{ id: "py-files", title: "Files" }] });
  const ids = classLevels("python", { "py-l4": 2 }, 1, { 1: v1, 2: v2 }).map((l) => l.level.id);
  assert.deepEqual(ids, ["py-l1", "py-l2", "py-l3", "py-l4"]);
});

test("allSnippets lists every snippet with its location", () => {
  const s = allSnippets(sample());
  assert.equal(s.length, 10);
  assert.match(s[0].where, /py-l1 \/ py-print \/ py-print-hello/);
});

// Runs every curriculum snippet through the same code path as the browser worker.
// Slow on first run (loads Python in Node). Run: npm test
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadPyodide } from "pyodide";
import { runInPyodide, explainError } from "../../src/python/core.js";
import { allSnippets } from "../../src/curriculum.js";

let py;
before(async () => { py = await loadPyodide(); });

async function run(code, stdin) {
  let out = "";
  const { error } = await runInPyodide(py, code, stdin, (t) => (out += t));
  return { out, error };
}

test("prints output and reports no error", async () => {
  const r = await run('print("hi", 1 + 2)');
  assert.equal(r.out, "hi 3\n");
  assert.equal(r.error, "");
});

test("input() reads the given lines", async () => {
  const r = await run('a = input("A? ")\nprint(a * 2)', ["xy"]);
  assert.match(r.out, /xyxy/);
});

test("input() without lines explains how to give input", async () => {
  const r = await run("input()");
  assert.match(r.error, /EOFError/);
  assert.match(r.error, /Input box/);
});

test("errors show the student's line and the error, not Pyodide internals", async () => {
  const r = await run("x = 1\nprint(y)");
  assert.match(r.error, /line 2/);
  assert.match(r.error, /NameError: name 'y' is not defined/);
  assert.doesNotMatch(r.error, /_pyodide|site-packages/);
});

test("variables do not leak between runs", async () => {
  await run("leak = 1");
  const r = await run("print(leak)");
  assert.match(r.error, /NameError/);
});

test("syntax errors are reported", async () => {
  const r = await run("if True print(1)");
  assert.match(r.error, /SyntaxError/);
});

test("explainError keeps the last line when there are no student frames", () => {
  assert.equal(explainError("Traceback\nValueError: x"), "ValueError: x");
});

test("every snippet in the sample curriculum runs without error", async () => {
  const c = JSON.parse(readFileSync("curriculum/curriculum.json", "utf8"));
  for (const s of allSnippets(c)) {
    const r = await run(s.code, s.stdin);
    assert.equal(r.error, "", `${s.where} failed: ${r.error}`);
  }
});

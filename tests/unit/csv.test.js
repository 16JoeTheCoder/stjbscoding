import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "../../src/csv.js";

test("quotes commas, quotes and newlines; neutralises formulas", () => {
  const csv = toCsv([{ a: 'x,"y"', b: "line1\nline2", c: "=HYPERLINK(1)", d: 3 }]);
  assert.equal(csv, '﻿a,b,c,d\r\n"x,""y""","line1\nline2",\'=HYPERLINK(1),3\r\n');
});

test("empty list gives empty text", () => {
  assert.equal(toCsv([]), "");
});

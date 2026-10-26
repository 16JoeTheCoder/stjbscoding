// Turns a list of flat objects into CSV text that Excel and Google Sheets open correctly.
export function toCsv(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Stop spreadsheet apps treating student text as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // The BOM makes Excel read the file as UTF-8.
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n";
}

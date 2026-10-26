// The code box used for library snippets and weekly projects: a plain <textarea>
// with Tab and auto-indent, a Run button, an Input box for input(), and the output.
// To upgrade to a real code editor later (e.g. CodeMirror), change only this file.
import { html, nothing } from "lit-html";
import { live } from "lit-html/directives/live.js";
import { runPython } from "./python/runner.js";

const INDENT = "    ";

// Keyboard help for the textarea: Tab indents, Shift+Tab outdents, Enter keeps indentation
// (and adds one level after a line ending in ":"), like Thonny.
function onKeydown(e) {
  const ta = e.target;
  const { selectionStart: s, selectionEnd: end, value } = ta;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  if (e.key === "Tab") {
    e.preventDefault();
    if (e.shiftKey) {
      const remove = value.slice(lineStart, lineStart + 4).match(/^ */)[0].length;
      ta.setRangeText("", lineStart, lineStart + remove, "preserve");
    } else {
      ta.setRangeText(INDENT, s, end, "end");
    }
    ta.dispatchEvent(new Event("input"));
  } else if (e.key === "Enter" && !e.ctrlKey) {
    e.preventDefault();
    const line = value.slice(lineStart, s);
    let indent = line.match(/^ */)[0];
    if (line.trimEnd().endsWith(":")) indent += INDENT;
    ta.setRangeText("\n" + indent, s, end, "end");
    ta.dispatchEvent(new Event("input"));
  } else if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    ta.closest(".codebox")?.querySelector("[data-run]")?.click();
  }
}

// state: { code, original, stdin (text), output, error, status: "" | "loading" | "running" }
let boxes = 0;
export function newCodeState(code, stdinLines = []) {
  return { id: `code-${++boxes}`, code, original: code, stdin: stdinLines.join("\n"), output: "", error: "", status: "" };
}

export async function run(state, rerender) {
  state.output = "";
  state.error = "";
  const stdin = state.stdin ? state.stdin.split("\n") : [];
  const result = await runPython(state.code, {
    stdin,
    onStatus: (s) => { state.status = s; rerender(); },
    onOutput: (t) => { state.output += t; rerender(); },
  });
  state.output = result.output;
  state.error = result.error;
  state.status = "";
  rerender();
  return result;
}

const STATUS_TEXT = { loading: "Loading Python (first run only, about 13 MB)...", running: "Running..." };

export function codeBox(state, rerender, { title = "main.py", label = "Code", onRun } = {}) {
  const lines = Math.max(4, Math.min(24, state.code.split("\n").length + 1));
  const needsInput = /\binput\s*\(/.test(state.code);
  return html`
    <div class="codebox jy-code">
      <div class="jy-code__bar"><span>${title}</span><span>Runs in your browser. Ctrl+Enter to run.</span></div>
      <label class="sr-only" for=${state.id}>${label}</label>
      <textarea id=${state.id} class="code-input" spellcheck="false" autocapitalize="off" autocomplete="off"
        rows=${lines} .value=${live(state.code)}
        @input=${(e) => { state.code = e.target.value; }}
        @keydown=${onKeydown}></textarea>
      ${needsInput ? html`
        <label class="stdin">
          <span class="jy-field__label">Input, one line per input()</span>
          <textarea class="code-input code-input--stdin" rows="2" .value=${live(state.stdin)} @input=${(e) => { state.stdin = e.target.value; }}></textarea>
        </label>` : nothing}
      <div class="codebox__actions">
        <button class="jy-btn jy-btn--ghost jy-btn--s" data-run ?disabled=${!!state.status}
          @click=${async () => { const r = await run(state, rerender); onRun?.(r); }}>Run</button>
        <button class="jy-btn jy-btn--ghost jy-btn--s" ?disabled=${!!state.status || state.code === state.original}
          @click=${() => { state.code = state.original; state.output = ""; state.error = ""; rerender(); }}>Reset</button>
        ${state.status ? html`<span class="muted" role="status">${STATUS_TEXT[state.status]}</span>` : nothing}
      </div>
      ${state.output || state.error ? html`
        <div class="output" aria-live="polite">
          ${state.output ? html`<pre>${state.output}</pre>` : nothing}
          ${state.error ? html`<pre class="output__error">${state.error}</pre>` : nothing}
        </div>` : nothing}
    </div>`;
}
